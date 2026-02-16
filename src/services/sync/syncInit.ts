import { rsaEncrypt, rsaDecrypt, arrayBufferToBase64Url, base64UrlToArrayBuffer } from '../auth/crypto'
import { getPublicKey } from '../auth/authService'
import { saveLinkedInstallation } from '../installation/installationStore'
import { getInstallationData, getPrivateKey, getLinkedInstallations, pushSync } from './index'
import * as syncApi from './syncApi'

/**
 * Send an init handshake package to a target device.
 * Encrypts our {uuid, publicKey} with the target's RSA public key.
 */
export async function sendInit(targetUuid: string, targetPublicKey: string): Promise<void> {
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) {
    throw new Error('Installation not registered')
  }

  const publicKey = await getPublicKey()
  if (!publicKey) {
    throw new Error('No public key available')
  }

  const payload = JSON.stringify({ uuid: installData.id, publicKey })
  const encrypted = await rsaEncrypt(
    new TextEncoder().encode(payload).buffer as ArrayBuffer,
    targetPublicKey
  )

  await syncApi.postInit(
    { target_uuid: targetUuid, encrypted_payload: arrayBufferToBase64Url(encrypted) },
    installData.jwt
  )
}

/**
 * Poll for init packages, process them (save linked installations, push full history,
 * introduce new devices to existing linked devices), and acknowledge.
 */
export async function pollAndProcessInit(): Promise<{ newDevices: string[] }> {
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) return { newDevices: [] }

  const privateKey = await getPrivateKey()
  if (!privateKey) return { newDevices: [] }

  const packages = await syncApi.getInit(installData.jwt)
  if (packages.length === 0) return { newDevices: [] }

  const processedIds: number[] = []
  const newDevices: string[] = []

  for (const pkg of packages) {
    try {
      // Decrypt the payload with our private key
      const decrypted = await rsaDecrypt(
        base64UrlToArrayBuffer(pkg.encrypted_payload),
        privateKey
      )
      const { uuid, publicKey } = JSON.parse(new TextDecoder().decode(decrypted)) as {
        uuid: string
        publicKey: string
      }

      // Save as linked installation
      await saveLinkedInstallation(uuid, publicKey)
      newDevices.push(uuid)

      // Push full history to the new device
      try {
        await pushSync({ targetUuid: uuid })
      } catch (err) {
        console.warn('[pollAndProcessInit] Full push to new device failed:', err)
      }

      // Introduce new device to all existing linked devices (and vice versa)
      const existingDevices = await getLinkedInstallations()
      const ownPublicKey = await getPublicKey()

      for (const device of existingDevices) {
        if (device.installation_id === uuid || device.installation_id === installData.id) continue
        if (!device.public_key || !ownPublicKey) continue

        try {
          // Tell existing device about the new device
          const newDevicePayload = JSON.stringify({ uuid, publicKey })
          const encForExisting = await rsaEncrypt(
            new TextEncoder().encode(newDevicePayload).buffer as ArrayBuffer,
            device.public_key
          )
          await syncApi.postInit(
            { target_uuid: device.installation_id, encrypted_payload: arrayBufferToBase64Url(encForExisting) },
            installData.jwt
          )

          // Tell new device about the existing device
          const existingPayload = JSON.stringify({ uuid: device.installation_id, publicKey: device.public_key })
          const encForNew = await rsaEncrypt(
            new TextEncoder().encode(existingPayload).buffer as ArrayBuffer,
            publicKey
          )
          await syncApi.postInit(
            { target_uuid: uuid, encrypted_payload: arrayBufferToBase64Url(encForNew) },
            installData.jwt
          )
        } catch (err) {
          console.warn('[pollAndProcessInit] Introduction failed for device:', device.installation_id, err)
        }
      }

      processedIds.push(pkg.id)
    } catch (err) {
      console.error('[pollAndProcessInit] Failed to process init package:', pkg.id, err)
    }
  }

  if (processedIds.length > 0) {
    await syncApi.deleteInit({ ids: processedIds }, installData.jwt)
  }

  return { newDevices }
}
