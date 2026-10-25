package com.song123jian.pricequery.mobile.data

import org.json.JSONArray
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.nio.ByteBuffer
import java.util.IdentityHashMap
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.xml.parsers.DocumentBuilderFactory

/** Changes source text tokens while retaining the source package's layout and media. */
object SourceDocxExporter {
    private const val W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    private const val R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    private const val WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    private const val PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
    private const val W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
    private const val VML = "urn:schemas-microsoft-com:vml"
    private const val O = "urn:schemas-microsoft-com:office:office"
    private const val DOCUMENT = "word/document.xml"
    private val tags = Regex("""<!--.*?-->|<!\[CDATA\[.*?\]\]>|<\?.*?\?>|<(?:[^<>"']|"[^"]*"|'[^']*')*>""", RegexOption.DOT_MATCHES_ALL)
    private val attributes = Regex("""([^\s=<>/]+)\s*=\s*(["'])(.*?)\2""", RegexOption.DOT_MATCHES_ALL)
    private val numericKey = Regex("(?:item[0-9]+_(?:price|quantity|amount)|total)")
    private val number = Regex("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")

    private data class Patch(val start: Int, val end: Int, val replacement: String)
    private data class XmlElement(
        val node: Element, val start: Int, val openEnd: Int,
        var closeStart: Int, var end: Int, val empty: Boolean,
        val parent: XmlElement?, val children: MutableList<XmlElement> = mutableListOf(),
    ) {
        fun isTag(namespace: String, name: String) = node.namespaceURI == namespace && node.localName == name
    }

    private class Xml(val text: String) {
        val elements = mutableListOf<XmlElement>()
        val root: XmlElement
        val texts: List<XmlElement>
        val paragraphs: List<XmlElement>
        init {
            require(!Regex("<!DOCTYPE", RegexOption.IGNORE_CASE).containsMatchIn(text)) { "DOCX XML must not contain a document type" }
            val factory = DocumentBuilderFactory.newInstance().apply {
                isNamespaceAware = true
                isExpandEntityReferences = false
            }
            val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)))
            val nodes = document.getElementsByTagName("*")
            var position = 0
            val stack = mutableListOf<XmlElement>()
            for (match in tags.findAll(text)) {
                val tag = match.value
                if (tag.startsWith("<?") || tag.startsWith("<!")) continue
                if (tag.startsWith("</")) {
                    require(stack.isNotEmpty()) { "DOCX XML token mismatch" }
                    val element = stack.removeAt(stack.lastIndex)
                    require(tag.substring(2, tag.length - 1).trim() == element.node.tagName) { "DOCX XML token mismatch" }
                    element.closeStart = match.range.first
                    element.end = match.range.last + 1
                } else {
                    require(position < nodes.length) { "DOCX XML element mismatch" }
                    val node = nodes.item(position++) as Element
                    require(Regex("<${Regex.escape(node.tagName)}(?=[\\s/>])").containsMatchIn(tag)) { "DOCX XML element mismatch" }
                    val end = match.range.last + 1
                    val element = XmlElement(node, match.range.first, end, end, end, tag.endsWith("/>"), stack.lastOrNull())
                    element.parent?.children?.add(element)
                    elements.add(element)
                    if (!element.empty) stack.add(element)
                }
            }
            require(stack.isEmpty() && position == nodes.length && elements.isNotEmpty()) { "Incomplete DOCX XML" }
            root = elements.first()
            texts = elements.filter { it.isTag(W, "t") }
            paragraphs = elements.filter { it.isTag(W, "p") }
        }
        fun raw(element: XmlElement) = text.substring(element.start, element.end)
    }

    private data class TextSlot(val index: Int, val start: Int, val text: String) {
        val length get() = text.codePointCount(0, text.length)
    }
    private data class Edit(val key: String, val start: Int, val end: Int)
    private data class Slot(val source: String, val nodes: List<TextSlot>, val edits: List<Edit>)
    private data class Entry(val metadata: ZipEntry, val data: ByteArray)

    private fun decode(data: ByteArray) = Charsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(data)).toString()
    private fun cpOffset(text: String, offset: Int) = text.offsetByCodePoints(0, offset)
    private fun escaped(text: String) = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    private fun attrEscaped(text: String) = escaped(text).replace("\"", "&quot;").replace("'", "&apos;")

    private fun splice(text: String, patches: List<Patch>): String {
        var cursor = 0
        return buildString {
            for (patch in patches.sortedWith(compareBy<Patch> { it.start }.thenBy { it.end })) {
                require(patch.start >= cursor && patch.end >= patch.start) { "Overlapping DOCX edits" }
                append(text, cursor, patch.start)
                append(patch.replacement)
                cursor = patch.end
            }
            append(text, cursor, text.length)
        }
    }

    private fun text(element: XmlElement): String {
        require(element.children.isEmpty()) { "Unexpected element inside w:t" }
        return element.node.textContent.orEmpty()
    }

    private fun attribute(xml: Xml, element: XmlElement, namespace: String, name: String, value: String): Patch {
        val opening = xml.text.substring(element.start, element.openEnd)
        for (match in attributes.findAll(opening)) {
            val attribute = element.node.getAttributeNode(match.groupValues[1]) ?: continue
            if (attribute.namespaceURI.orEmpty() == namespace && (attribute.localName ?: attribute.name) == name) {
                val range = match.groups[3]!!.range
                return Patch(element.start + range.first, element.start + range.last + 1, attrEscaped(value))
            }
        }
        error("Missing DOCX attribute $name")
    }

    private fun withChildren(xml: Xml, element: XmlElement, children: String): String = if (element.empty) {
        xml.text.substring(element.start, element.openEnd - 2) + ">" + children + "</${element.node.tagName}>"
    } else {
        xml.text.substring(element.start, element.closeStart) + children + xml.text.substring(element.closeStart, element.end)
    }

    private fun sameValue(key: String, old: String, new: String): Boolean {
        if (old == new) return true
        return numericKey.matches(key) && number.matches(old.trim()) && number.matches(new.trim()) &&
            BigDecimal(old.trim()).compareTo(BigDecimal(new.trim())) == 0
    }

    private fun prepare(xml: Xml, slots: List<org.json.JSONObject>): List<Slot> {
        val indices = IdentityHashMap<Element, Int>()
        xml.texts.forEachIndexed { index, element -> indices[element.node] = index }
        val seen = mutableSetOf<Int>()
        return slots.map { slot ->
            val paragraph = slot.getInt("paragraph")
            require(paragraph in xml.paragraphs.indices && seen.add(paragraph)) { "Invalid or repeated DOCX paragraph slot" }
            val nodes = mutableListOf<TextSlot>()
            val descendants = xml.paragraphs[paragraph].node.getElementsByTagNameNS(W, "t")
            var position = 0
            for (i in 0 until descendants.length) {
                val index = indices[descendants.item(i)] ?: error("Unknown DOCX text node")
                val value = text(xml.texts[index])
                nodes.add(TextSlot(index, position, value))
                position += value.codePointCount(0, value.length)
            }
            val source = nodes.joinToString("") { it.text }
            val expected = slot.getJSONArray("nodes")
            require(source == slot.getString("source") && expected.length() == nodes.size) { "DOCX source does not match its slot manifest" }
            nodes.forEachIndexed { index, node ->
                val item = expected.getJSONObject(index)
                require(item.getInt("index") == node.index && item.getInt("start") == node.start && item.getString("text") == node.text) {
                    "DOCX source does not match its slot manifest"
                }
            }
            val edits = slot.getJSONArray("edits").let { array ->
                (0 until array.length()).flatMap { index ->
                    val edit = array.getJSONObject(index)
                    val children = edit.optJSONArray("word_edits") ?: JSONArray().put(edit)
                    (0 until children.length()).map { children.getJSONObject(it).let { e -> Edit(e.getString("key"), e.getInt("start"), e.getInt("end")) } }
                }
            }.sortedWith(compareBy<Edit> { it.start }.thenBy { it.end })
            var previousEnd = -1
            var previousStart = -1
            val length = source.codePointCount(0, source.length)
            for (edit in edits) {
                require(edit.start in 0..length && edit.end in edit.start..length && edit.start >= previousEnd && edit.start != previousStart) {
                    "Invalid or overlapping DOCX slot edits"
                }
                previousStart = edit.start
                previousEnd = edit.end
            }
            Slot(source, nodes, edits)
        }
    }

    private fun textXml(xml: Xml, element: XmlElement, value: String): String {
        var offset = 0
        while (offset < value.length) {
            val point = value.codePointAt(offset)
            require(point in listOf(9, 10, 13) || point in 0x20..0xD7FF || point in 0xE000..0xFFFD || point in 0x10000..0x10FFFF) {
                "Text contains a character forbidden in XML"
            }
            offset += Character.charCount(point)
        }
        var opening = xml.text.substring(element.start, element.openEnd)
        if (element.empty) opening = opening.dropLast(2) + ">"
        val space = Regex("""\bxml:space\s*=\s*(["']).*?\1""", RegexOption.DOT_MATCHES_ALL)
        opening = if (space.containsMatchIn(opening)) space.replace(opening, "xml:space=\"preserve\"") else opening.dropLast(1) + " xml:space=\"preserve\">"
        val closing = "</${element.node.tagName}>"
        val prefix = element.node.prefix?.let { "$it:" }.orEmpty()
        return value.split('\n').joinToString("<${prefix}br/>") { opening + escaped(it) + closing }
    }

    private fun render(xml: Xml, slots: List<Slot>, values: Map<String, String>): String {
        val changes = linkedMapOf<Int, MutableList<Patch>>()
        for (slot in slots) for (edit in slot.edits) {
            val new = values[edit.key] ?: continue
            val old = slot.source.substring(cpOffset(slot.source, edit.start), cpOffset(slot.source, edit.end))
            if (sameValue(edit.key, old, new)) continue
            val value = new.replace("\r\n", "\n").replace('\r', '\n')
            val affected = if (edit.start == edit.end) {
                listOfNotNull(slot.nodes.firstOrNull { it.start <= edit.start && edit.start < it.start + it.length } ?: slot.nodes.lastOrNull())
            } else slot.nodes.filter { it.start < edit.end && it.start + it.length > edit.start }
            require(affected.isNotEmpty()) { "DOCX edit has no text node" }
            affected.forEachIndexed { index, node ->
                val start = maxOf(0, edit.start - node.start)
                val end = minOf(node.length, edit.end - node.start)
                val replacement = if (value.codePointCount(0, value.length) == edit.end - edit.start) {
                    value.substring(cpOffset(value, node.start + start - edit.start), cpOffset(value, node.start + end - edit.start))
                } else if (index == 0) value else ""
                changes.getOrPut(node.index) { mutableListOf() }.add(Patch(cpOffset(node.text, start), cpOffset(node.text, end), replacement))
            }
        }
        return splice(xml.text, changes.mapNotNull { (index, edits) ->
            val element = xml.texts[index]
            val old = text(element)
            val new = splice(old, edits)
            if (new == old) null else Patch(element.start, element.end, textXml(xml, element, new))
        })
    }

    private fun trimProductRows(text: String, slots: List<org.json.JSONObject>, values: Map<String, String>): String {
        val productKey = Regex("item[0-9]+_[a-z]+")
        val unused = values.filter { (key, value) -> productKey.matches(key) && value.isBlank() }.keys
        if (unused.isEmpty()) return text
        val xml = Xml(text)
        val rows = linkedMapOf<Int, Pair<XmlElement, MutableSet<String>>>()
        slots.forEach { slot ->
            val keys = slot.getJSONArray("edits").let { array -> (0 until array.length()).map { array.getJSONObject(it).getString("key") } }.filter(productKey::matches)
            if (keys.isNotEmpty()) {
                var row: XmlElement? = xml.paragraphs[slot.getInt("paragraph")]
                while (row != null && !row.isTag(W, "tr")) row = row.parent
                row?.let { rows.getOrPut(it.start) { it to mutableSetOf() }.second.addAll(keys) }
            }
        }
        val patches = rows.values.mapNotNull { (row, keys) ->
            if (unused.containsAll(keys) && xml.texts.none { it.start > row.start && it.start < row.end && it.node.textContent.isNotBlank() } &&
                row.node.getElementsByTagNameNS(W, "drawing").length == 0 && row.node.getElementsByTagNameNS(W, "pict").length == 0) Patch(row.start, row.end, "") else null
        }
        return splice(text, patches)
    }

    private fun section(xml: Xml, section: XmlElement, nextPage: Boolean, relationshipIds: Map<String, String>): String {
        val patches = mutableListOf<Patch>()
        val prefix = section.node.prefix?.let { "$it:" }.orEmpty()
        for (child in section.children) if (child.isTag(W, "headerReference") || child.isTag(W, "footerReference")) {
            relationshipIds[child.node.getAttributeNS(R, "id")]?.let { patches.add(attribute(xml, child, R, "id", it)) }
        }
        if (nextPage) {
            val kind = section.children.firstOrNull { it.isTag(W, "type") }
            val replacement = "<${prefix}type ${prefix}val=\"nextPage\"/>"
            if (kind != null) patches.add(attribute(xml, kind, W, "val", "nextPage"))
            else if (section.empty) return withChildren(xml, section, replacement)
            else {
                val preceding = setOf("headerReference", "footerReference", "footnotePr", "endnotePr")
                val at = section.children.firstOrNull { it.node.localName !in preceding }?.start ?: section.closeStart
                patches.add(Patch(at, at, replacement))
            }
        }
        return splice(xml.raw(section), patches.map { it.copy(start = it.start - section.start, end = it.end - section.start) })
    }

    private fun uniqueCopy(text: String, page: Int): String {
        val xml = Xml(text)
        val patches = mutableListOf<Patch>()
        val paired = linkedMapOf<Pair<String, String>, String>()
        val bookmarks = mutableMapOf<String, String>()
        val shapes = mutableMapOf<String, String>()
        val suffix = "_source_p${page + 1}"
        val stride = (xml.elements.filter { it.node.namespaceURI in listOf(WP, PIC) && it.node.hasAttribute("id") }
            .mapNotNull { it.node.getAttribute("id").toLongOrNull() }.maxOrNull() ?: 0L) + 1
        val pairedStrides = mapOf("bookmark" to setOf("bookmarkStart", "bookmarkEnd"), "perm" to setOf("permStart", "permEnd")).mapValues { (_, names) ->
            (xml.elements.filter { it.node.namespaceURI == W && it.node.localName in names }.maxOfOrNull { it.node.getAttributeNS(W, "id").toLong() } ?: 0L) + 1
        }
        val usedNames = xml.elements.filter { it.isTag(W, "bookmarkStart") }.map { it.node.getAttributeNS(W, "name") }.toMutableSet()
        for (element in xml.elements) {
            val node = element.node
            require(!(node.namespaceURI == W && node.localName in setOf("footnoteReference", "endnoteReference", "commentRangeStart", "commentRangeEnd", "commentReference"))) {
                "Multipage DOCX with notes/comments requires separate note cloning"
            }
            if (node.namespaceURI in listOf(WP, PIC) && node.localName in setOf("docPr", "cNvPr") && node.hasAttribute("id")) {
                patches.add(attribute(xml, element, "", "id", (node.getAttribute("id").toLong() + stride * page).toString()))
            }
            if (node.namespaceURI == W && node.localName in setOf("bookmarkStart", "bookmarkEnd", "permStart", "permEnd")) {
                val group = if (node.localName.startsWith("bookmark")) "bookmark" else "perm"
                val old = node.getAttributeNS(W, "id")
                val identifier = paired.getOrPut(group to old) { (old.toLong() + pairedStrides.getValue(group) * page).toString() }
                patches.add(attribute(xml, element, W, "id", identifier))
                if (node.localName == "bookmarkStart" && node.hasAttributeNS(W, "name")) {
                    val name = node.getAttributeNS(W, "name")
                    var tail = suffix
                    var serial = 1
                    while (name.take(40 - tail.length) + tail in usedNames) { tail = "${suffix}_${serial++}" }
                    val new = name.take(40 - tail.length) + tail
                    usedNames.add(new)
                    bookmarks[name] = new
                    patches.add(attribute(xml, element, W, "name", new))
                }
            }
            if (node.namespaceURI == VML && node.localName in setOf("shape", "shapetype") && node.hasAttribute("id")) {
                val old = node.getAttribute("id")
                shapes[old] = old + suffix
                patches.add(attribute(xml, element, "", "id", old + suffix))
            }
            for (name in listOf("paraId", "textId")) if (node.hasAttributeNS(W14, name)) {
                // Editing-session IDs are optional; copied paragraphs must not reuse them.
                val attributeName = node.getAttributeNodeNS(W14, name).name
                val opening = xml.text.substring(element.start, element.openEnd)
                val match = attributes.findAll(opening).first { it.groupValues[1] == attributeName }
                patches.add(Patch(element.start + match.range.first, element.start + match.range.last + 1, ""))
            }
        }
        for (element in xml.elements) {
            val node = element.node
            if (element.isTag(W, "hyperlink")) bookmarks[node.getAttributeNS(W, "anchor")]?.let { patches.add(attribute(xml, element, W, "anchor", it)) }
            for ((namespace, name) in listOf("" to "type", O to "spid")) {
                val value = node.getAttributeNS(namespace.ifEmpty { null }, name)
                val lookup = if (name == "type" && value.startsWith("#")) value.drop(1) else value
                shapes[lookup]?.let { patches.add(attribute(xml, element, namespace, name, (if (value.startsWith("#")) "#" else "") + it)) }
            }
        }
        return splice(text, patches)
    }

    private fun multipage(documents: List<String>, relationships: List<Map<String, String>>): String {
        var prefix: String? = null
        var suffix = ""
        val pages = mutableListOf<String>()
        documents.forEachIndexed { index, original ->
            var value = if (index == 0) original else uniqueCopy(original, index)
            var xml = Xml(value)
            var body = xml.root.children.first { it.isTag(W, "body") }
            require(!body.empty && body.children.lastOrNull()?.isTag(W, "sectPr") == true) { "Multipage DOCX requires a final body section" }
            val sections = xml.elements.filter { it.isTag(W, "sectPr") }
            // Section type describes its start; internal continuous sections remain intact.
            value = splice(value, sections.map { Patch(it.start, it.end, section(xml, it, index > 0 && it === sections.first(), relationships[index])) })
            xml = Xml(value)
            body = xml.root.children.first { it.isTag(W, "body") }
            val section = body.children.last()
            var content = value.substring(body.openEnd, section.start)
            if (index < documents.lastIndex) {
                val last = body.children.getOrNull(body.children.size - 2)
                val q = body.node.prefix?.let { "$it:" }.orEmpty()
                if (last?.isTag(W, "p") == true) {
                    val props = last.children.firstOrNull { it.isTag(W, "pPr") }
                    require(props?.children?.none { it.isTag(W, "sectPr") } != false) { "Final paragraph already contains a section" }
                    if (props != null) {
                        val change = props.children.firstOrNull { it.isTag(W, "pPrChange") }
                        val replacement = if (change != null) {
                            val at = change.start - props.start
                            splice(xml.raw(props), listOf(Patch(at, at, xml.raw(section))))
                        } else withChildren(xml, props, xml.raw(section))
                        content = splice(content, listOf(Patch(props.start - body.openEnd, props.end - body.openEnd, replacement)))
                    } else if (last.empty) {
                        content = splice(content, listOf(Patch(last.start - body.openEnd, last.end - body.openEnd, withChildren(xml, last, "<${q}pPr>${xml.raw(section)}</${q}pPr>"))))
                    } else {
                        val at = last.openEnd - body.openEnd
                        content = splice(content, listOf(Patch(at, at, "<${q}pPr>${xml.raw(section)}</${q}pPr>")))
                    }
                } else {
                    content += "<${q}p><${q}pPr><${q}spacing ${q}before=\"0\" ${q}after=\"0\" ${q}line=\"1\" ${q}lineRule=\"exact\"/>${xml.raw(section)}</${q}pPr></${q}p>"
                }
            } else content += xml.raw(section)
            if (prefix == null) { prefix = value.substring(0, body.openEnd); suffix = value.substring(body.closeStart) }
            pages.add(content)
        }
        return (prefix.orEmpty() + pages.joinToString("") + suffix).also { Xml(it) }
    }

    /** Manifest ranges use Unicode code points, matching the desktop exporter. */
    fun build(template: ByteArray, slots: JSONArray, pages: List<Map<String, String>>): ByteArray {
        require(pages.isNotEmpty()) { "At least one DOCX page is required" }
        val entries = linkedMapOf<String, Entry>()
        ZipInputStream(ByteArrayInputStream(template)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                require(entry.name !in entries) { "Duplicate DOCX package entries" }
                val data = zip.readBytes()
                entries[entry.name] = Entry(ZipEntry(entry), data)
            }
        }
        val original = entries.mapValues { it.value.data }
        require(DOCUMENT in original) { "Missing DOCX document" }
        val grouped = (0 until slots.length()).map { slots.getJSONObject(it) }.groupBy { it.getString("part") }
        val rendered = pages.map { linkedMapOf<String, ByteArray>() }
        for ((part, partSlots) in grouped) {
            require(Regex("word/(?:document|header[^/]*|footer[^/]*)\\.xml").matches(part) && part in original) { "Invalid DOCX slot part" }
            val xml = Xml(decode(original.getValue(part)))
            val prepared = prepare(xml, partSlots)
            pages.forEachIndexed { index, values -> rendered[index][part] = trimProductRows(render(xml, prepared, values), partSlots, values).toByteArray(Charsets.UTF_8) }
        }
        val changed = rendered.first().filter { (part, data) -> !data.contentEquals(original.getValue(part)) }.toMutableMap()
        val relationships = pages.map { mutableMapOf<String, String>() }
        if (pages.size > 1) {
            val variants = rendered.drop(1).flatMapIndexed { index, parts -> parts.filter { (part, data) -> part != DOCUMENT && !data.contentEquals(rendered.first().getValue(part)) }.map { Triple(index + 1, it.key, it.value) } }
            if (variants.isNotEmpty()) {
                val relName = "word/_rels/document.xml.rels"
                val typeName = "[Content_Types].xml"
                val rels = Xml(decode(original.getValue(relName)))
                val types = Xml(decode(original.getValue(typeName)))
                val relAdditions = mutableListOf<String>()
                val typeAdditions = mutableListOf<String>()
                val usedIds = rels.root.children.map { it.node.getAttribute("Id") }.toMutableSet()
                for ((index, part, data) in variants) {
                    val stem = part.substringBeforeLast('.')
                    val extension = part.substringAfterLast('.')
                    var serial = index + 1
                    var clone = "$stem-source-$serial.$extension"
                    while (clone in original || clone in changed) { serial++; clone = "$stem-source-$serial.$extension" }
                    changed[clone] = data
                    val sidecar = "${part.substringBeforeLast('/')}/_rels/${part.substringAfterLast('/')}.rels"
                    original[sidecar]?.let { changed["${clone.substringBeforeLast('/')}/_rels/${clone.substringAfterLast('/')}.rels"] = it }
                    val override = types.root.children.first { it.node.getAttribute("PartName") == "/$part" }
                    val tq = types.root.node.prefix?.let { "$it:" }.orEmpty()
                    typeAdditions.add("<${tq}Override PartName=\"/$clone\" ContentType=\"${attrEscaped(override.node.getAttribute("ContentType"))}\"/>")
                    var matched = false
                    for (relation in rels.root.children) {
                        val node = relation.node
                        val target = node.getAttribute("Target")
                        val segments = mutableListOf<String>()
                        for (segment in (if (target.startsWith('/')) target.drop(1) else "word/$target").split('/')) {
                            when (segment) { "", "." -> Unit; ".." -> if (segments.isNotEmpty()) segments.removeAt(segments.lastIndex); else -> segments.add(segment) }
                        }
                        if (segments.joinToString("/") == part && node.getAttribute("TargetMode") != "External") {
                            matched = true
                            var number = 1
                            var identifier = "rIdSourceDocx$number"
                            while (identifier in usedIds) { number++; identifier = "rIdSourceDocx$number" }
                            usedIds.add(identifier)
                            relationships[index][node.getAttribute("Id")] = identifier
                            val rq = rels.root.node.prefix?.let { "$it:" }.orEmpty()
                            relAdditions.add("<${rq}Relationship Id=\"$identifier\" Type=\"${attrEscaped(node.getAttribute("Type"))}\" Target=\"${clone.removePrefix("word/")}\"/>")
                        }
                    }
                    require(matched) { "DOCX header/footer part has no internal relationship" }
                }
                changed[relName] = withChildren(rels, rels.root, relAdditions.joinToString("")).toByteArray(Charsets.UTF_8)
                changed[typeName] = withChildren(types, types.root, typeAdditions.joinToString("")).toByteArray(Charsets.UTF_8)
            }
            changed[DOCUMENT] = multipage(rendered.map { decode(it[DOCUMENT] ?: original.getValue(DOCUMENT)) }, relationships).toByteArray(Charsets.UTF_8)
        }
        if (changed.isEmpty()) return template
        for ((name, data) in changed) if (name.endsWith(".xml") || name.endsWith(".rels")) Xml(decode(data))
        val output = ByteArrayOutputStream()
        ZipOutputStream(output).use { zip ->
            zipComment(template)?.let { zip.setComment(it) }
            for ((name, entry) in entries) {
                val data = changed.remove(name) ?: entry.data
                val metadata = ZipEntry(entry.metadata).apply {
                    size = data.size.toLong()
                    crc = CRC32().apply { update(data) }.value
                    compressedSize = if (method == ZipEntry.STORED) size else -1
                }
                zip.putNextEntry(metadata); zip.write(data); zip.closeEntry()
            }
            for ((name, data) in changed) { zip.putNextEntry(ZipEntry(name)); zip.write(data); zip.closeEntry() }
        }
        return output.toByteArray()
    }

    private fun zipComment(template: ByteArray): String? {
        for (at in template.size - 22 downTo maxOf(0, template.size - 65_557)) {
            if (template[at] == 0x50.toByte() && template[at + 1] == 0x4b.toByte() && template[at + 2] == 5.toByte() && template[at + 3] == 6.toByte()) {
                val length = (template[at + 20].toInt() and 255) or ((template[at + 21].toInt() and 255) shl 8)
                if (at + 22 + length == template.size && length > 0) return decode(template.copyOfRange(at + 22, template.size))
            }
        }
        return null
    }
}
