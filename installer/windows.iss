[Setup]
AppId={{7B9AF3BF-098F-47C0-BC89-69F55233F02D}
AppName=Pin
AppVersion={#PinVersion}
AppPublisher=Pin
AppPublisherURL=https://github.com/yumiaomiao2025/pin
DefaultDirName={localappdata}\Programs\Pin
DefaultGroupName=Pin
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
AllowNoIcons=yes
UninstallDisplayIcon={app}\Pin.exe
SetupIconFile=..\assets\pin.ico
OutputBaseFilename=Pin-{#PinVersion}-win-x64-setup
WizardStyle=modern
Compression=lzma2/fast
SolidCompression=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
english.UninstallPin=Uninstall Pin
chinesesimplified.UninstallPin=卸载 Pin

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "..\out\Pin-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Pin"; Filename: "{app}\Pin.exe"
Name: "{group}\{cm:UninstallPin}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pin"; Filename: "{app}\Pin.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Pin.exe"; Description: "{cm:LaunchProgram,Pin}"; Flags: nowait postinstall skipifsilent unchecked

[Code]
const
  RunKey = 'Software\Microsoft\Windows\CurrentVersion\Run';
  ApprovedKey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run';

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Names: TArrayOfString;
  Command, InstalledExe: String;
  I: Integer;
begin
  if CurUninstallStep <> usPostUninstall then
    Exit;

  { Electron stores a plain or quoted executable path for Pin's login item.
    Match the installed path so an entry for a portable copy stays intact. }
  InstalledExe := ExpandConstant('{app}\Pin.exe');
  if RegGetValueNames(HKCU, RunKey, Names) then
    for I := 0 to GetArrayLength(Names) - 1 do
      if RegQueryStringValue(HKCU, RunKey, Names[I], Command) then
        if (CompareText(Command, InstalledExe) = 0) or
           (CompareText(Command, '"' + InstalledExe + '"') = 0) then
          if RegDeleteValue(HKCU, RunKey, Names[I]) then
            RegDeleteValue(HKCU, ApprovedKey, Names[I]);
end;
