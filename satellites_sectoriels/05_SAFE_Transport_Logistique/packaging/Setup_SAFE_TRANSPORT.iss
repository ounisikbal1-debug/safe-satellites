[Setup]
AppName=SAFE Transport et Logistique
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\TRANSPORT
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_TRANSPORT_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_TRANSPORT.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE Transport"; Filename: "{app}\SAFE_TRANSPORT.exe"
Name: "{commondesktop}\SAFE Transport"; Filename: "{app}\SAFE_TRANSPORT.exe"

[Run]
Filename: "{app}\SAFE_TRANSPORT.exe"; Description: "Lancer SAFE Transport"; Flags: nowait postinstall skipifsilent
