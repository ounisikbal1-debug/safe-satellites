/**
 * Module de Sécurité & Verrou Matériel Hardware ID (HMAC-SHA256)
 * SAFE ERP - Protection Commerciale Officielle pour Satellites Métiers
 */
import * as crypto from 'crypto';
import * as os from 'os';

const SECRET_SALT = Buffer.from('SAFE_ERP_TUNISIE_2026_MASTER_HMAC_KEY_#991');

export function getHardwareId(): string {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model : 'CPU';
  const raw = `${os.hostname()}-${model}-${os.platform()}-${os.arch()}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  return `HW-${hash.substring(0, 12)}`;
}

export function computeValidLicenseKey(hardwareId: string, expiryDate: string): string {
  const cleanExp = expiryDate.replace(/-/g, '');
  const payload = `SAFE_Grandes_Entreprises|${hardwareId.toUpperCase()}|${cleanExp}`;
  const hmac = crypto.createHmac('sha256', SECRET_SALT).update(payload).digest('hex').toUpperCase();
  const parts = [
    hmac.substring(0, 4),
    hmac.substring(4, 8),
    hmac.substring(8, 12),
    hmac.substring(12, 16)
  ];
  return `SAFE-${cleanExp}-${parts.join('-')}`;
}

export function verifySatelliteLicense(licenseKey: string): { valid: boolean; hardwareId: string; message: string } {
  const hwId = getHardwareId();
  if (!licenseKey || !licenseKey.startsWith('SAFE-')) {
    return { valid: false, hardwareId: hwId, message: 'Format de clé de licence SAFE invalide.' };
  }

  const parts = licenseKey.trim().toUpperCase().split('-');
  if (parts.length !== 6) {
    return { valid: false, hardwareId: hwId, message: 'Structure de licence incomplète.' };
  }

  const expStr = parts[1]; // YYYYMMDD
  const expYear = parseInt(expStr.substring(0, 4));
  const expMonth = parseInt(expStr.substring(4, 6)) - 1;
  const expDay = parseInt(expStr.substring(6, 8));
  const expiryDate = new Date(expYear, expMonth, expDay);

  if (expiryDate < new Date()) {
    return { valid: false, hardwareId: hwId, message: `Licence expirée le ${expiryDate.toLocaleDateString('fr-FR')}.` };
  }

  const expectedKey = computeValidLicenseKey(hwId, `${expStr.substring(0,4)}-${expStr.substring(4,6)}-${expStr.substring(6,8)}`);
  if (licenseKey.trim().toUpperCase() !== expectedKey) {
    return { valid: false, hardwareId: hwId, message: `Licence non autorisée sur cette machine (${hwId}).` };
  }

  return { valid: true, hardwareId: hwId, message: `Licence vérifiée et valide jusqu'au ${expiryDate.toLocaleDateString('fr-FR')}.` };
}


