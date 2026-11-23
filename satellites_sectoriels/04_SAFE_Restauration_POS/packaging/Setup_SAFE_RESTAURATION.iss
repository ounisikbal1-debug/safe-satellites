[Setup]
AppName=SAFE Restauration & POS
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\RESTAURATION
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_RESTAURATION_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_RESTAURATION.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE Restauration & POS"; Filename: "{app}\SAFE_RESTAURATION.exe"
Name: "{commondesktop}\SAFE Restauration & POS"; Filename: "{app}\SAFE_RESTAURATION.exe"

[Run]
Filename: "{app}\SAFE_RESTAURATION.exe"; Description: "Lancer SAFE Restauration & POS"; Flags: nowait postinstall skipifsilent
