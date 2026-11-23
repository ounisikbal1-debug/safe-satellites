[Setup]
AppName=SAFE CRM Editeur et Licences
AppVersion=2.1
DefaultDirName={autopf}\SAFE_ERP\CRM_EDITEUR
DefaultGroupName=SAFE ERP Tunisie
OutputBaseFilename=Setup_SAFE_CRM_LICENCES_v2.1
Compression=lzma
SolidCompression=yes

[Files]
Source: "..\dist\SAFE_CRM_LICENCES.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SAFE CRM Editeur"; Filename: "{app}\SAFE_CRM_LICENCES.exe"
Name: "{commondesktop}\SAFE CRM Editeur"; Filename: "{app}\SAFE_CRM_LICENCES.exe"

[Run]
Filename: "{app}\SAFE_CRM_LICENCES.exe"; Description: "Lancer SAFE CRM Editeur"; Flags: nowait postinstall skipifsilent
