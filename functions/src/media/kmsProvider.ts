import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type DevelopmentKeyData = {
  publicKeyPem: string;
  privateKeyPem: string;
  algorithm: 'RSA-PSS-SHA256' | 'ECDSA-P256-SHA256';
};

const DEV_KEY_IDS: Record<
  string,
  'RSA-PSS-SHA256' | 'ECDSA-P256-SHA256'
> = {
  'cred-fema-primary': 'RSA-PSS-SHA256',
  'cred-who-active': 'ECDSA-P256-SHA256',
  'cred-fema-compromised-2024': 'RSA-PSS-SHA256',
};

const DEV_KEY_FILE = path.join(process.cwd(), '.dev-kms-keys.json');

function loadDevelopmentKeys(): Record<string, DevelopmentKeyData> {
  if (!fs.existsSync(DEV_KEY_FILE)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DEV_KEY_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveDevelopmentKeys(keys: Record<string, DevelopmentKeyData>): void {
  fs.writeFileSync(
    DEV_KEY_FILE,
    JSON.stringify(keys, null, 2),
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
}

function generateDevelopmentKey(
  algorithm: 'RSA-PSS-SHA256' | 'ECDSA-P256-SHA256',
): DevelopmentKeyData {
  if (algorithm === 'ECDSA-P256-SHA256') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      algorithm,
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    algorithm,
  };
}

/**
 * Modular interface for Cryptographic Key Management & Signing.
 * Designed to allow plugging in Google Cloud KMS or HSMs.
 */
export interface IKMSProvider {
  signHash(credentialId: string, hashHex: string, algorithm?: string): Promise<string>;
  verifySignature(
    publicKeyPem: string,
    hashHex: string,
    signatureBase64: string,
    algorithm?: string,
  ): Promise<boolean>;
  generateKeyPair(
    algorithm?: 'RSA-PSS-SHA256' | 'ECDSA-P256-SHA256',
    deterministicId?: string,
  ): Promise<{ publicKeyPem: string; privateKeyId: string }>;
}

/**
 * Backend Cryptographic Provider implementation using Node.js crypto.
 *
 * Development private keys are kept only in the local ignored
 * .dev-kms-keys.json file and in memory. No private keys are stored
 * in source control or Firestore.
 */
export class NodeCryptoKMSProvider implements IKMSProvider {
  private static privateKeyVault: Map<string, string> = new Map();

  /**
   * Loads persistent local development keys into the in-memory vault.
   * Missing keys are generated on demand by generateKeyPair().
   */
  static hydrateDevelopmentVault(): void {
    const keys = loadDevelopmentKeys();

    for (const [credId, keyData] of Object.entries(keys)) {
      if (
        keyData &&
        typeof keyData.privateKeyPem === 'string' &&
        keyData.privateKeyPem.trim() !== ''
      ) {
        NodeCryptoKMSProvider.privateKeyVault.set(
          credId,
          keyData.privateKeyPem,
        );
      }
    }
  }

  async generateKeyPair(
    algorithm: 'RSA-PSS-SHA256' | 'ECDSA-P256-SHA256' = 'RSA-PSS-SHA256',
    deterministicId?: string,
  ): Promise<{ publicKeyPem: string; privateKeyId: string }> {
    if (deterministicId && DEV_KEY_IDS[deterministicId]) {
      const expectedAlgorithm = DEV_KEY_IDS[deterministicId];
      const keys = loadDevelopmentKeys();
      let keyData = keys[deterministicId];

      if (
        !keyData ||
        keyData.algorithm !== expectedAlgorithm ||
        !keyData.privateKeyPem ||
        !keyData.publicKeyPem
      ) {
        keyData = generateDevelopmentKey(expectedAlgorithm);
        keys[deterministicId] = keyData;
        saveDevelopmentKeys(keys);
      }

      NodeCryptoKMSProvider.privateKeyVault.set(
        deterministicId,
        keyData.privateKeyPem,
      );

      return {
        publicKeyPem: keyData.publicKeyPem,
        privateKeyId: deterministicId,
      };
    }

    const keyId = `kms-key-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    const keyData = generateDevelopmentKey(algorithm);

    NodeCryptoKMSProvider.privateKeyVault.set(
      keyId,
      keyData.privateKeyPem,
    );

    return {
      publicKeyPem: keyData.publicKeyPem,
      privateKeyId: keyId,
    };
  }

  async signHash(
    credentialId: string,
    hashHex: string,
    _algorithm: string = 'RSA-PSS-SHA256',
  ): Promise<string> {
    const privateKey =
      NodeCryptoKMSProvider.privateKeyVault.get(credentialId);

    if (!privateKey) {
      throw new Error(
        `KMS_KEY_NOT_FOUND: Cryptographic private key for credential '${credentialId}' not found in KMS vault.`,
      );
    }

    const dataBuffer = Buffer.from(hashHex, 'hex');
    const signer = crypto.createSign('SHA256');
    signer.update(dataBuffer);
    signer.end();

    return signer.sign(privateKey, 'base64');
  }

  async verifySignature(
    publicKeyPem: string,
    hashHex: string,
    signatureBase64: string,
    _algorithm: string = 'RSA-PSS-SHA256',
  ): Promise<boolean> {
    try {
      const dataBuffer = Buffer.from(hashHex, 'hex');
      const verifier = crypto.createVerify('SHA256');
      verifier.update(dataBuffer);
      verifier.end();

      return verifier.verify(
        publicKeyPem,
        signatureBase64,
        'base64',
      );
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  }

  static registerKey(keyId: string, privateKeyPem: string) {
    if (privateKeyPem && privateKeyPem.trim() !== '') {
      NodeCryptoKMSProvider.privateKeyVault.set(
        keyId,
        privateKeyPem,
      );
    }
  }

  static getPrivateKey(keyId: string): string | undefined {
    return NodeCryptoKMSProvider.privateKeyVault.get(keyId);
  }
}

export const kmsProvider: IKMSProvider =
  new NodeCryptoKMSProvider();

/**
 * Dedicated development KMS hydration function.
 */
export function hydrateDevelopmentKmsVault(): void {
  NodeCryptoKMSProvider.hydrateDevelopmentVault();
}
