; Native per-user installation. User data is deliberately absent from [Files].
[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}.0
VersionInfoDescription={#AppName} Installer {#InstallerRevision}
DefaultDirName={#DefaultDirName}
DefaultGroupName={#GroupName}
DisableProgramGroupPage=yes
DisableDirPage=no
AppendDefaultDirName=no
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
WizardSizePercent=110
SetupIconFile={#PayloadDir}\app.ico
UninstallDisplayIcon={app}\app.ico
UninstallDisplayName={#AppName} {#AppVersion}
UninstallLogMode=append
CloseApplications=no
RestartApplications=no
AllowCancelDuringInstall=no
SetupLogging=yes
Compression=lzma2/fast
SolidCompression=yes
OutputBaseFilename=setup

[Languages]
Name: "chinesesimp"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式(&D)"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\installer-release.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\install-info.ini"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#GroupName}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{userprograms}\{#GroupName}\卸载工作"; Filename: "{uninstallexe}"; Parameters: "/LOG"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "运行工作"; Flags: nowait postinstall skipifsilent unchecked

[Code]
const
  NativeKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1';
  LegacyKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\PriceQueryDesktop';

var
  PurgePersonalData: Boolean;
  UninstallDataPath: String;

function GetFileAttributes(Path: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';
function GetDriveType(Root: String): LongWord;
  external 'GetDriveTypeW@kernel32.dll stdcall';
function OpenExclusive(Path: String; Access, Share: LongWord; Security: Integer;
  Creation, Attributes: LongWord; Template: Integer): Integer;
  external 'CreateFileW@kernel32.dll stdcall';
function CloseHandle(Handle: Integer): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

function SamePath(A, B: String): Boolean;
begin
  Result := CompareText(RemoveBackslashUnlessRoot(A), RemoveBackslashUnlessRoot(B)) = 0;
end;

function IsWithin(Path, Parent: String): Boolean;
begin
  Result := SamePath(Path, Parent) or
    (CompareText(Copy(Path, 1, Length(AddBackslash(Parent))), AddBackslash(Parent)) = 0);
end;

function IsOrphanedRegistration(Directory: String): Boolean;
begin
  Directory := RemoveBackslashUnlessRoot(Directory);
  Result := (Directory <> '') and
    not FileExists(AddBackslash(Directory) + '{#AppExeName}') and
    not FileExists(AddBackslash(Directory) + 'unins000.exe');
end;

function HasUninstallParameter(const Parameter: String): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
    if CompareText(ParamStr(I), Parameter) = 0 then begin
      Result := True;
      Exit;
    end;
end;

function DirectoryContainsReparsePoint(Path: String): Boolean;
var
  FindRec: TFindRec;
  Attributes: LongWord;
begin
  Result := False;
  Attributes := GetFileAttributes(Path);
  if Attributes = $FFFFFFFF then begin
    Result := True;
    Exit;
  end;
  if (Attributes and $400) <> 0 then begin
    Result := True;
    Exit;
  end;
  if not FindFirst(AddBackslash(Path) + '*', FindRec) then begin
    Result := True;
    Exit;
  end;
  try
    repeat
      if (FindRec.Name <> '.') and (FindRec.Name <> '..') then begin
        if (FindRec.Attributes and $400) <> 0 then
          Result := True
        else if ((FindRec.Attributes and $10) <> 0) and
                DirectoryContainsReparsePoint(AddBackslash(Path) + FindRec.Name) then
          Result := True;
      end;
    until Result or not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

function PathError(Path: String): String;
var
  I: Integer;
  Part, Base, Ancestor: String;
  Attr, DriveType: LongWord;
begin
  Path := RemoveBackslashUnlessRoot(Path);
  Result := '请选择本地磁盘上的专用安装文件夹。';
  if (Length(Path) < 4) or (Path[2] <> ':') or (Path[3] <> '\') or
     (Pos(Uppercase(Path[1]), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') = 0) then Exit;
  if Length(Path) > 200 then begin
    Result := '安装路径不能超过 200 个字符。'; Exit;
  end;
  Part := '';
  for I := 4 to Length(Path) + 1 do begin
    if I <= Length(Path) then begin
      if Path[I] <> '\' then begin
        if (Ord(Path[I]) < 32) or (Pos(Path[I], '<>:"|?*/') > 0) then Exit;
        Part := Part + Path[I];
      end;
    end;
    if (I > Length(Path)) or (Path[I] = '\') then begin
      if (Part = '') or (Part[Length(Part)] = '.') or (Part[Length(Part)] = ' ') then Exit;
      Base := Uppercase(Part);
      if Pos('.', Base) > 0 then Base := Copy(Base, 1, Pos('.', Base) - 1);
      if (Base = 'CON') or (Base = 'PRN') or (Base = 'AUX') or (Base = 'NUL') or
         ((Length(Base) = 4) and ((Copy(Base, 1, 3) = 'COM') or
         (Copy(Base, 1, 3) = 'LPT')) and (Pos(Base[4], '123456789') > 0)) then Exit;
      Part := '';
    end;
  end;
  DriveType := GetDriveType(Copy(Path, 1, 3));
  if (DriveType <> 2) and (DriveType <> 3) then Exit;
  if IsWithin(Path, ExpandConstant('{win}')) or
     IsWithin(Path, ExpandConstant('{commonpf32}')) or
     IsWithin(Path, ExpandConstant('{commonpf64}')) or
     IsWithin(Path, ExpandConstant('{commonappdata}')) then begin
    Result := '请选择 Windows、Program Files 和 ProgramData 之外的可写文件夹。'; Exit;
  end;
  Ancestor := RemoveBackslashUnlessRoot(Path);
  while Length(Ancestor) > 3 do begin
    Attr := GetFileAttributes(Ancestor);
    if Attr <> $FFFFFFFF then begin
      if ((Attr and $400) <> 0) or ((Attr and $10) = 0) then begin
        Result := '安装路径不能经过文件、目录链接或联接点。'; Exit;
      end;
    end;
    Ancestor := ExtractFileDir(Ancestor);
  end;
  Result := '';
end;

function AppIsInUse(Directory: String): Boolean;
var
  AppPath: String;
  Handle: Integer;
begin
  AppPath := AddBackslash(Directory) + '{#AppExeName}';
  Result := False;
  if not FileExists(AppPath) then Exit;
  Handle := OpenExclusive(AppPath, $C0000000, 0, 0, 3, $80, 0);
  Result := Handle = -1;
  if not Result then CloseHandle(Handle);
end;

function TargetError(Directory: String): String;
var
  Registered, RawDir: String;
  Existing: TFindRec;
  Upgrade: Boolean;
begin
  RawDir := ExpandConstant('{param:DIR|}');
  if RawDir <> '' then begin
    Result := PathError(RawDir);
    if Result <> '' then Exit;
  end;
  Directory := RemoveBackslashUnlessRoot(Directory);
  Result := PathError(Directory);
  if Result <> '' then Exit;
  Registered := '';
  RegQueryStringValue(HKCU, NativeKey, 'InstallLocation', Registered);
  if (Registered <> '') and not SamePath(Registered, Directory) then begin
    if IsOrphanedRegistration(Registered) then
      Log('Orphaned registration retained; its directory and data are not changed.')
    else begin
      Result := '已有安装位于 ' + Registered + '。更换目录前请先退出程序并从系统卸载；data 会保留。'; Exit;
    end;
  end;
  Upgrade := (Registered <> '') and SamePath(Registered, Directory) and
    not IsOrphanedRegistration(Registered);
  if Upgrade then begin
    if GetIniString('Setup', 'ProductId', '', AddBackslash(Directory) + 'install-info.ini') <> '{#AppId}' then begin
      Result := '安装归属记录不匹配，已停止覆盖。请核对原安装。'; Exit;
    end;
    if not FileExists(AddBackslash(Directory) + 'unins000.exe') then begin
      Result := '原卸载程序缺失，请先修复原安装记录。'; Exit;
    end;
  end else if FindFirst(AddBackslash(Directory) + '*', Existing) then begin
    try
      repeat
        if (Existing.Name <> '.') and (Existing.Name <> '..') then
          if (CompareText(Existing.Name, 'data') <> 0) or
             ((Existing.Attributes and $10) = 0) or ((Existing.Attributes and $400) <> 0) then begin
            Result := '请选择空文件夹，或仅含保留 data 的文件夹；不会覆盖其他文件。'; Exit;
          end;
      until not FindNext(Existing);
    finally
      FindClose(Existing);
    end;
  end;
  if not Upgrade then begin
    if FileExists(ExpandConstant('{userprograms}\{#GroupName}\{#AppName}.lnk')) or
       FileExists(ExpandConstant('{userprograms}\{#GroupName}\卸载工作.lnk')) or
       (WizardIsTaskSelected('desktopicon') and FileExists(ExpandConstant('{userdesktop}\{#AppName}.lnk'))) then begin
      Result := '已有同名快捷方式，已停止覆盖。请先核对旧快捷方式。'; Exit;
    end;
  end;
  if AppIsInUse(Directory) then begin
    Result := '工作正在运行或程序文件被占用，请从托盘退出后重试。'; Exit;
  end;
  Result := '';
end;

function InitializeSetup(): Boolean;
var
  LegacyDir: String;
begin
  Result := True;
  if RegQueryStringValue(HKCU, LegacyKey, 'InstallLocation', LegacyDir) then begin
    if FileExists(AddBackslash(LegacyDir) + '{#AppExeName}') then begin
      SuppressibleMsgBox('检测到旧安装：' + LegacyDir + '。请先退出并卸载旧安装，data 会保留。', mbError, MB_OK, IDOK);
      Result := False;
    end else Log('Stale legacy registration retained; no legacy files or registry entries are changed.');
  end;
end;

procedure InitializeWizard();
var
  Registered: String;
begin
  if ExpandConstant('{param:DIR|}') <> '' then Exit;
  Registered := '';
  if RegQueryStringValue(HKCU, NativeKey, 'InstallLocation', Registered) and
     (Registered <> '') and IsOrphanedRegistration(Registered) then
    WizardForm.DirEdit.Text := ExpandConstant('{#DefaultDirName}');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Error: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then begin
    Error := PathError(WizardForm.DirEdit.Text);
    Result := Error = '';
    if not Result then SuppressibleMsgBox(Error, mbError, MB_OK, IDOK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := TargetError(WizardDirValue);
end;

function InitializeUninstall(): Boolean;
var
  Error, Registered: String;
  Answer: Integer;
begin
  Error := PathError(ExpandConstant('{app}'));
  Registered := '';
  RegQueryStringValue(HKCU, NativeKey, 'InstallLocation', Registered);
  if (Error = '') and not SamePath(Registered, ExpandConstant('{app}')) then
    Error := '系统登记与卸载目录不匹配，已停止卸载。';
  if (Error = '') and AppIsInUse(ExpandConstant('{app}')) then
    Error := '工作正在运行或程序文件被占用，请从托盘退出后重试。';
  Result := Error = '';
  if not Result then begin
    Log(Error);
    SuppressibleMsgBox(Error, mbError, MB_OK, IDOK);
    Exit;
  end;

  UninstallDataPath := AddBackslash(ExpandConstant('{app}')) + 'data';
  PurgePersonalData := False;
  if HasUninstallParameter('/PURGEDATA') then
    PurgePersonalData := True
  else if not UninstallSilent then begin
    Answer := MsgBox('是否保留个人资料（data 文件夹）？选择“否”将永久删除 data；安装目录的其他个人文件仍会保留。',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON1);
    if Answer = IDNO then
      PurgePersonalData := True
    else if Answer <> IDYES then
      Result := False;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and PurgePersonalData then begin
    if not DirExists(UninstallDataPath) then Exit;
    if DirectoryContainsReparsePoint(UninstallDataPath) then begin
      Log('Personal data retained because a reparse point exists or the data directory could not be verified.');
      if not UninstallSilent then
        MsgBox('data 文件夹包含目录联接或符号链接，或无法安全检查；为避免误删，已保留整份个人资料。',
          mbInformation, MB_OK);
    end else if DelTree(UninstallDataPath, True, True, True) then
      Log('Personal data directory deleted after explicit user choice.')
    else begin
      Log('Personal data deletion was incomplete; remaining files were retained.');
      if not UninstallSilent then
        MsgBox('未能完整删除 data 文件夹，剩余文件仍保留在安装目录。', mbInformation, MB_OK);
    end;
  end;
end;
