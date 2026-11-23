[Setup]
AppName=SAFE Négoce & Distribution
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\NEGOCE
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_NEGOCE_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_NEGOCE.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE Négoce & Distribution"; Filename: "{app}\SAFE_NEGOCE.exe"
Name: "{commondesktop}\SAFE Négoce & Distribution"; Filename: "{app}\SAFE_NEGOCE.exe"

[Run]
Filename: "{app}\SAFE_NEGOCE.exe"; Description: "Lancer SAFE Négoce & Distribution"; Flags: nowait postinstall skipifsilent
