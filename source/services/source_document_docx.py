"""Edit source DOCX text without reserializing its formatting or media parts."""
from __future__ import annotations

import copy
import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from decimal import Decimal
from xml.dom import minidom
from xml.sax.saxutils import escape

_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
_W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
_VML = "urn:schemas-microsoft-com:vml"
_O = "urn:schemas-microsoft-com:office:office"
_TAGS = re.compile(r'''<!--.*?-->|<!\[CDATA\[.*?\]\]>|<\?.*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>''', re.S)
_ATTRS = re.compile(r'''([^\s=<>/]+)\s*=\s*(["'])(.*?)\2''', re.S)
_NUMERIC_KEY = re.compile(r"(?:item[0-9]+_(?:price|quantity|amount)|total)\Z")
_NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)\Z")
_DOCUMENT = "word/document.xml"


@dataclass
class _Element:
    node: minidom.Element
    start: int
    open_end: int
    close_start: int
    end: int
    empty: bool
    parent: _Element | None
    children: list[_Element] = field(default_factory=list)

    def is_tag(self, namespace, name):
        return self.node.namespaceURI == namespace and self.node.localName == name


class _Xml:
    def __init__(self, text):
        if re.search(r"<!DOCTYPE", text, re.I):
            raise ValueError("DOCX XML must not contain a document type")
        self.text = text
        document = minidom.parseString(text.encode("utf-8"))
        nodes = iter(document.getElementsByTagName("*"))
        self.elements = []
        self.by_node = {}
        stack = []
        for match in _TAGS.finditer(text):
            tag = match.group()
            if tag.startswith(("<?", "<!")):
                continue
            if tag.startswith("</"):
                element = stack.pop()
                if tag[2:-1].strip() != element.node.tagName:
                    raise ValueError("DOCX XML token mismatch")
                element.close_start, element.end = match.start(), match.end()
            else:
                node = next(nodes)
                if not re.match(r"<"+re.escape(node.tagName)+r"(?=[\s/>])", tag):
                    raise ValueError("DOCX XML element mismatch")
                empty = tag.endswith("/>")
                element = _Element(node, match.start(), match.end(), match.end(), match.end(),
                                   empty, stack[-1] if stack else None)
                if element.parent:
                    element.parent.children.append(element)
                self.elements.append(element)
                self.by_node[id(node)] = element
                if not empty:
                    stack.append(element)
        if stack or next(nodes, None) is not None or not self.elements:
            raise ValueError("Incomplete DOCX XML")
        self.root = self.elements[0]
        self.texts = [e for e in self.elements if e.is_tag(_W, "t")]
        self.paragraphs = [e for e in self.elements if e.is_tag(_W, "p")]

    def raw(self, element):
        return self.text[element.start:element.end]


def _splice(text, patches):
    pieces, cursor = [], 0
    for start, end, replacement in sorted(patches, key=lambda p: (p[0], p[1])):
        if start < cursor or end < start:
            raise ValueError("Overlapping DOCX edits")
        pieces.extend((text[cursor:start], replacement))
        cursor = end
    pieces.append(text[cursor:])
    return "".join(pieces)


def _text(element):
    if element.children:
        raise ValueError("Unexpected element inside w:t")
    return "".join(n.data for n in element.node.childNodes if n.nodeType in (n.TEXT_NODE, n.CDATA_SECTION_NODE))


def _attribute(xml, element, namespace, name, value):
    for match in _ATTRS.finditer(xml.text, element.start, element.open_end):
        attribute = element.node.getAttributeNode(match[1])
        if attribute and (attribute.namespaceURI or "") == namespace and attribute.localName == name:
            return match.start(3), match.end(3), escape(value, {'"': "&quot;", "'": "&apos;"})
    raise ValueError(f"Missing DOCX attribute {name}")


def _with_children(xml, element, children):
    if element.empty:
        return xml.text[element.start:element.open_end-2]+">"+children+"</"+element.node.tagName+">"
    return xml.text[element.start:element.close_start]+children+xml.text[element.close_start:element.end]


def _same_value(key, old, new):
    if old == new:
        return True
    if _NUMERIC_KEY.fullmatch(key) and _NUMBER.fullmatch(old.strip()) and _NUMBER.fullmatch(new.strip()):
        return Decimal(old.strip()) == Decimal(new.strip())
    return False


def _prepare(xml, slots):
    indices = {id(e.node): i for i, e in enumerate(xml.texts)}
    prepared, seen = [], set()
    for slot in slots:
        paragraph = slot["paragraph"]
        if not isinstance(paragraph, int) or not 0 <= paragraph < len(xml.paragraphs) or paragraph in seen:
            raise ValueError("Invalid or repeated DOCX paragraph slot")
        seen.add(paragraph)
        nodes, position = [], 0
        for node in xml.paragraphs[paragraph].node.getElementsByTagNameNS(_W, "t"):
            element = xml.texts[indices[id(node)]]
            value = _text(element)
            nodes.append({"index": indices[id(node)], "start": position, "text": value})
            position += len(value)
        source = "".join(n["text"] for n in nodes)
        if source != slot["source"] or nodes != slot["nodes"]:
            raise ValueError("DOCX source does not match its slot manifest")
        edits = sorted(
            [child for edit in slot["edits"] for child in edit.get("word_edits", [edit])],
            key=lambda e: (e["start"], e["end"]),
        )
        previous_end, previous_start = -1, -1
        for edit in edits:
            start, end = edit["start"], edit["end"]
            if (not isinstance(start, int) or not isinstance(end, int) or not isinstance(edit["key"], str)
                    or not 0 <= start <= end <= len(source) or start < previous_end or start == previous_start):
                raise ValueError("Invalid or overlapping DOCX slot edits")
            previous_start, previous_end = start, end
        prepared.append((source, nodes, edits))
    return prepared


def _text_xml(xml, element, value):
    if any(not (c in "\t\n\r" or 0x20 <= ord(c) <= 0xD7FF or 0xE000 <= ord(c) <= 0xFFFD
                or 0x10000 <= ord(c) <= 0x10FFFF) for c in value):
        raise ValueError("Text contains a character forbidden in XML")
    opening = xml.text[element.start:element.open_end]
    if element.empty:
        opening = opening[:-2]+">"
    space = re.compile(r'''\bxml:space\s*=\s*(["']).*?\1''', re.S)
    opening = space.sub('xml:space="preserve"', opening) if space.search(opening) else opening[:-1]+' xml:space="preserve">'
    closing = "</"+element.node.tagName+">"
    prefix = element.node.tagName.rpartition(":")[0]
    br = "<"+(prefix+":" if prefix else "")+"br/>"
    return br.join(opening+escape(line)+closing for line in value.split("\n"))


def _render(xml, slots, values):
    changes = {}
    for source, nodes, edits in slots:
        for edit in edits:
            key, start, end = edit["key"], edit["start"], edit["end"]
            if key not in values:
                continue
            value = values[key]
            if not isinstance(value, str):
                raise ValueError("DOCX values must be strings")
            if _same_value(key, source[start:end], value):
                continue
            value = value.replace("\r\n", "\n").replace("\r", "\n")
            affected = [n for n in nodes if n["start"] < end and n["start"]+len(n["text"]) > start]
            if start == end:
                affected = [next((n for n in nodes if n["start"] <= start < n["start"]+len(n["text"])),
                                 nodes[-1] if nodes else None)]
            if not affected or affected[0] is None:
                raise ValueError("DOCX edit has no text node")
            for i, node in enumerate(affected):
                local_start = max(0, start-node["start"])
                local_end = min(len(node["text"]), end-node["start"])
                replacement = value if i == 0 else ""
                if len(value) == end - start:
                    replacement = value[node["start"] + local_start - start : node["start"] + local_end - start]
                changes.setdefault(node["index"], []).append((local_start, local_end, replacement))
    patches = []
    for index, edits in changes.items():
        element = xml.texts[index]
        value = _splice(_text(element), edits)
        if value != _text(element):
            patches.append((element.start, element.end, _text_xml(xml, element, value)))
    return _splice(xml.text, patches)


def _trim_product_rows(text, slots, values):
    """Remove only declared product rows whose rendered cells are all empty."""
    unused = {key for key, value in values.items() if re.fullmatch(r"item[0-9]+_[a-z]+", key) and not value.strip()}
    if not unused:
        return text
    xml = _Xml(text)
    rows = {}
    for slot in slots:
        keys = {edit["key"] for edit in slot["edits"] if re.fullmatch(r"item[0-9]+_[a-z]+", edit["key"])}
        if not keys:
            continue
        row = xml.paragraphs[slot["paragraph"]]
        while row and not row.is_tag(_W, "tr"):
            row = row.parent
        if row:
            rows.setdefault(row.start, (row, set()))[1].update(keys)
    patches = []
    for row, keys in rows.values():
        if keys <= unused and not any(_text(element).strip() for element in xml.texts
                                      if row.start < element.start < row.end):
            if not row.node.getElementsByTagNameNS(_W, "drawing") and not row.node.getElementsByTagNameNS(_W, "pict"):
                patches.append((row.start, row.end, ""))
    return _splice(text, patches)


def _section(xml, section, next_page, relationship_ids):
    patches = []
    prefix = section.node.tagName.rpartition(":")[0]
    q = prefix+":" if prefix else ""
    for child in section.children:
        if child.is_tag(_W, "headerReference") or child.is_tag(_W, "footerReference"):
            current = child.node.getAttributeNS(_R, "id")
            if current in relationship_ids:
                patches.append(_attribute(xml, child, _R, "id", relationship_ids[current]))
    if next_page:
        kind = next((c for c in section.children if c.is_tag(_W, "type")), None)
        replacement = '<'+q+'type '+q+'val="nextPage"/>'
        if kind:
            patches.append(_attribute(xml, kind, _W, "val", "nextPage"))
        elif section.empty:
            return _with_children(xml, section, replacement)
        else:
            preceding = {"headerReference", "footerReference", "footnotePr", "endnotePr"}
            position = next((c.start for c in section.children if c.node.localName not in preceding), section.close_start)
            patches.append((position, position, replacement))
    relative = [(s-section.start, e-section.start, value) for s, e, value in patches]
    return _splice(xml.raw(section), relative)


def _unique_copy(text, page):
    """Copied drawing and bookmark identifiers must remain document-wide unique."""
    xml = _Xml(text)
    patches, paired, bookmarks, shapes = [], {}, {}, {}
    suffix = f"_source_p{page+1}"
    drawing_ids = [int(e.node.getAttribute("id")) for e in xml.elements
                   if e.node.namespaceURI in (_WP, _PIC) and e.node.hasAttribute("id") and e.node.getAttribute("id").isdigit()]
    stride = max(drawing_ids, default=0)+1
    paired_strides = {}
    for group, names in (("bookmark", {"bookmarkStart", "bookmarkEnd"}), ("perm", {"permStart", "permEnd"})):
        paired_strides[group] = max((int(e.node.getAttributeNS(_W, "id")) for e in xml.elements
                                    if e.node.namespaceURI == _W and e.node.localName in names), default=0)+1
    used_names = {e.node.getAttributeNS(_W, "name") for e in xml.elements if e.is_tag(_W, "bookmarkStart")}
    for element in xml.elements:
        node = element.node
        if element.is_tag(_W, "footnoteReference") or element.is_tag(_W, "endnoteReference") or (
                node.namespaceURI == _W and node.localName in {"commentRangeStart", "commentRangeEnd", "commentReference"}):
            raise ValueError("Multipage DOCX with notes/comments requires separate note cloning")
        if node.namespaceURI in (_WP, _PIC) and node.localName in ("docPr", "cNvPr") and node.hasAttribute("id"):
            old = node.getAttribute("id")
            patches.append(_attribute(xml, element, "", "id", str(int(old)+stride*page)))
        if node.namespaceURI == _W and node.localName in {"bookmarkStart", "bookmarkEnd", "permStart", "permEnd"}:
            old = node.getAttributeNS(_W, "id")
            group = "bookmark" if node.localName.startswith("bookmark") else "perm"
            identifier = paired.setdefault((group, old), str(int(old)+paired_strides[group]*page))
            patches.append(_attribute(xml, element, _W, "id", identifier))
            if node.localName == "bookmarkStart" and node.hasAttributeNS(_W, "name"):
                name = node.getAttributeNS(_W, "name")
                tail, serial = suffix, 1
                while name[:40-len(tail)]+tail in used_names:
                    tail = suffix+f"_{serial}"
                    serial += 1
                bookmarks[name] = name[:40-len(tail)]+tail
                used_names.add(bookmarks[name])
                patches.append(_attribute(xml, element, _W, "name", bookmarks[name]))
        if node.namespaceURI == _VML and node.localName in {"shape", "shapetype"} and node.hasAttribute("id"):
            old = node.getAttribute("id")
            shapes[old] = old+suffix
            patches.append(_attribute(xml, element, "", "id", shapes[old]))
        for name in ("paraId", "textId"):
            if node.hasAttributeNS(_W14, name):
                # These optional editing-session identifiers may be omitted on copies.
                attribute = node.getAttributeNodeNS(_W14, name)
                match = next(m for m in _ATTRS.finditer(xml.text, element.start, element.open_end) if m[1] == attribute.name)
                patches.append((match.start(), match.end(), ""))
    for element in xml.elements:
        node = element.node
        if element.is_tag(_W, "hyperlink") and node.getAttributeNS(_W, "anchor") in bookmarks:
            patches.append(_attribute(xml, element, _W, "anchor", bookmarks[node.getAttributeNS(_W, "anchor")]))
        for namespace, name in (("", "type"), (_O, "spid")):
            value = node.getAttributeNS(namespace or None, name)
            lookup = value[1:] if name == "type" and value.startswith("#") else value
            if lookup in shapes:
                patches.append(_attribute(xml, element, namespace, name, ("#" if value.startswith("#") else "")+shapes[lookup]))
    return _splice(text, patches)


def _multipage(documents, relationships):
    pages, prefix, suffix = [], None, None
    for index, (text, ids) in enumerate(zip(documents, relationships)):
        if index:
            text = _unique_copy(text, index)
        xml = _Xml(text)
        body = next(e for e in xml.root.children if e.is_tag(_W, "body"))
        if body.empty or not body.children or not body.children[-1].is_tag(_W, "sectPr"):
            raise ValueError("Multipage DOCX requires a final body section")
        section = body.children[-1]
        sections = [e for e in xml.elements if e.is_tag(_W, "sectPr")]
        # Section type describes its start, so the copied first section owns nextPage.
        patches = [(s.start, s.end, _section(xml, s, bool(index and s is sections[0]), ids)) for s in sections]
        text = _splice(text, patches)
        xml = _Xml(text)
        body = next(e for e in xml.root.children if e.is_tag(_W, "body"))
        section = body.children[-1]
        content = text[body.open_end:section.start]
        if index+1 < len(documents):
            last = body.children[-2] if len(body.children) > 1 else None
            q = (body.node.prefix+":") if body.node.prefix else ""
            if last and last.is_tag(_W, "p"):
                props = next((e for e in last.children if e.is_tag(_W, "pPr")), None)
                if props and any(e.is_tag(_W, "sectPr") for e in props.children):
                    raise ValueError("Final paragraph already contains a section")
                if props:
                    change = next((e for e in props.children if e.is_tag(_W, "pPrChange")), None)
                    if change:
                        at = change.start-props.start
                        replacement = _splice(xml.raw(props), [(at, at, xml.raw(section))])
                    else:
                        replacement = _with_children(xml, props, xml.raw(section))
                    content = _splice(content, [(props.start-body.open_end, props.end-body.open_end, replacement)])
                elif last.empty:
                    replacement = _with_children(xml, last, '<'+q+'pPr>'+xml.raw(section)+'</'+q+'pPr>')
                    content = _splice(content, [(last.start-body.open_end, last.end-body.open_end, replacement)])
                else:
                    at = last.open_end-body.open_end
                    content = _splice(content, [(at, at, '<'+q+'pPr>'+xml.raw(section)+'</'+q+'pPr>')])
            else:
                content += '<'+q+'p><'+q+'pPr><'+q+'spacing '+q+'before="0" '+q+'after="0" '+q+'line="1" '+q+'lineRule="exact"/>'+xml.raw(section)+'</'+q+'pPr></'+q+'p>'
        else:
            content += xml.raw(section)
        if prefix is None:
            prefix, suffix = text[:body.open_end], text[body.close_start:]
        pages.append(content)
    result = prefix+"".join(pages)+suffix
    _Xml(result)
    return result


def build_docx(template: bytes, slots: list[dict], pages: list[dict[str, str]]) -> bytes:
    """Missing value keys leave the source text intact; all offsets are code points."""
    if not pages:
        raise ValueError("At least one DOCX page is required")
    with zipfile.ZipFile(io.BytesIO(template)) as archive:
        entries = archive.infolist()
        if len({e.filename for e in entries}) != len(entries):
            raise ValueError("Duplicate DOCX package entries")
        original = {e.filename: archive.read(e) for e in entries}
        comment = archive.comment
    if _DOCUMENT not in original:
        raise ValueError("Missing DOCX document")
    grouped = {}
    for slot in slots:
        part = slot["part"]
        if not re.fullmatch(r"word/(?:document|header[^/]*|footer[^/]*)\.xml", part) or part not in original:
            raise ValueError("Invalid DOCX slot part")
        grouped.setdefault(part, []).append(slot)
    rendered = [dict() for _ in pages]
    for part, part_slots in grouped.items():
        xml = _Xml(original[part].decode("utf-8"))
        prepared = _prepare(xml, part_slots)
        for values, output in zip(pages, rendered):
            output[part] = _trim_product_rows(_render(xml, prepared, values), part_slots, values).encode("utf-8")
    changed = {name: data for name, data in rendered[0].items() if data != original[name]}
    if len(pages) > 1:
        relationships = [dict() for _ in pages]
        variants = [(i, part, data) for i, output in enumerate(rendered[1:], 1)
                    for part, data in output.items() if part != _DOCUMENT and data != rendered[0][part]]
        if variants:
            rel_name, type_name = "word/_rels/document.xml.rels", "[Content_Types].xml"
            rels, types = _Xml(original[rel_name].decode("utf-8")), _Xml(original[type_name].decode("utf-8"))
            rel_additions, type_additions = [], []
            used_ids = {e.node.getAttribute("Id") for e in rels.root.children}
            for index, part, data in variants:
                stem, extension = posixpath.splitext(part)
                serial = index+1
                clone = f"{stem}-source-{serial}{extension}"
                while clone in original or clone in changed:
                    serial += 1
                    clone = f"{stem}-source-{serial}{extension}"
                changed[clone] = data
                sidecar = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part)+".rels")
                if sidecar in original:
                    changed[posixpath.join(posixpath.dirname(clone), "_rels", posixpath.basename(clone)+".rels")] = original[sidecar]
                override = next(e for e in types.root.children if e.node.getAttribute("PartName") == "/"+part)
                tq = (types.root.node.prefix+":") if types.root.node.prefix else ""
                type_additions.append('<'+tq+'Override PartName="/'+clone+'" ContentType="'+override.node.getAttribute("ContentType")+'"/>')
                matched = False
                for relation in rels.root.children:
                    node = relation.node
                    target = node.getAttribute("Target")
                    resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join("word", target))
                    if resolved == part and node.getAttribute("TargetMode") != "External":
                        matched = True
                        identifier = "rIdSourceDocx1"
                        number = 1
                        while identifier in used_ids:
                            number += 1
                            identifier = f"rIdSourceDocx{number}"
                        used_ids.add(identifier)
                        relationships[index][node.getAttribute("Id")] = identifier
                        rq = (rels.root.node.prefix+":") if rels.root.node.prefix else ""
                        rel_additions.append('<'+rq+'Relationship Id="'+identifier+'" Type="'+node.getAttribute("Type")+'" Target="'+clone.removeprefix("word/")+'"/>')
                if not matched:
                    raise ValueError("DOCX header/footer part has no internal relationship")
            changed[rel_name] = _with_children(rels, rels.root, "".join(rel_additions)).encode("utf-8")
            changed[type_name] = _with_children(types, types.root, "".join(type_additions)).encode("utf-8")
        documents = [output.get(_DOCUMENT, original[_DOCUMENT]).decode("utf-8") for output in rendered]
        changed[_DOCUMENT] = _multipage(documents, relationships).encode("utf-8")
    if not changed:
        return template
    for name, data in changed.items():
        if name.endswith(".xml") or name.endswith(".rels"):
            _Xml(data.decode("utf-8"))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.comment = comment
        for entry in entries:
            archive.writestr(copy.copy(entry), changed.pop(entry.filename, original[entry.filename]))
        for name, data in changed.items():
            archive.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    return output.getvalue()
