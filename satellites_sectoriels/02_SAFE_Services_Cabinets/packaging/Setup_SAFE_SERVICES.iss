[Setup]
AppName=SAFE Services & Cabinets
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\SERVICES
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_SERVICES_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_SERVICES.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE Services & Cabinets"; Filename: "{app}\SAFE_SERVICES.exe"
Name: "{commondesktop}\SAFE Services & Cabinets"; Filename: "{app}\SAFE_SERVICES.exe"

[Run]
Filename: "{app}\SAFE_SERVICES.exe"; Description: "Lancer SAFE Services & Cabinets"; Flags: nowait postinstall skipifsilent
