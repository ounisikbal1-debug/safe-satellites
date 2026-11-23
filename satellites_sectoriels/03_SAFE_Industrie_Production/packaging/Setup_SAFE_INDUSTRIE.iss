[Setup]
AppName=SAFE Industrie & Production
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\INDUSTRIE
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_INDUSTRIE_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_INDUSTRIE.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE Industrie & Production"; Filename: "{app}\SAFE_INDUSTRIE.exe"
Name: "{commondesktop}\SAFE Industrie & Production"; Filename: "{app}\SAFE_INDUSTRIE.exe"

[Run]
Filename: "{app}\SAFE_INDUSTRIE.exe"; Description: "Lancer SAFE Industrie & Production"; Flags: nowait postinstall skipifsilent
