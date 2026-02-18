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

  const toEncrypt = JSON.stringify({ uuid: installData.id })
  const encrypted = await rsaEncrypt(
    new TextEncoder().encode(toEncrypt).buffer as ArrayBuffer,
    targetPublicKey
  )
  const payload = {
    msg: arrayBufferToBase64Url(encrypted),
    publicKey
  }

  await syncApi.postInit(
    { uuid: targetUuid, payload: JSON.stringify(payload), },
    installData.jwt
  )
}

/**
 * Poll for init packages, process them (save linked installations, push full history,
 * introduce new devices to existing linked devices), and acknowledge.
 */
export async function pollAndProcessInit(): Promise<{ newDevices: string[], done: boolean }> {
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) return { newDevices: [], done: false }

  const privateKey = await getPrivateKey()
  if (!privateKey) return { newDevices: [], done: false }

  const packages = await syncApi.getInit(installData.jwt, installData.id)
  if (packages.length === 0) {
    // No pending packages — if we already have linked devices, handshake is complete
    const linked = await getLinkedInstallations()
    return { newDevices: [], done: linked.length > 0 }
  }

  const processedIds: number[] = []
  const newDevices: string[] = []

  // Check which devices are already linked to skip re-introductions
  const alreadyLinked = new Set(
    (await getLinkedInstallations()).map(d => d.installation_id)
  )

  for (const pkg of packages) {
    try {
      // Decrypt the payload with our private key
      const { msg, publicKey } = JSON.parse(pkg.payload) as {
        msg: string
        publicKey: string
      }
      const decrypted = await rsaDecrypt(
        base64UrlToArrayBuffer(msg),
        privateKey
      )
      const { uuid } = JSON.parse(new TextDecoder().decode(decrypted)) as {
        uuid: string
      }

      // Skip if already linked — just ack the package
      if (alreadyLinked.has(uuid)) {
        processedIds.push(pkg.id)
        continue
      }

      // Save as linked installation
      await saveLinkedInstallation(uuid, publicKey)
      alreadyLinked.add(uuid)
      newDevices.push(uuid)

      // Push full history to the new device (with retry)
      let pushSuccess = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await pushSync({ targetUuid: uuid })
          pushSuccess = true
          break
        } catch (err) {
          console.warn(`[pollAndProcessInit] Full push attempt ${attempt}/3 failed:`, err)
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000))
        }
      }
      if (!pushSuccess) {
        console.error('[pollAndProcessInit] Full push to new device failed after 3 attempts')
      }

      // Introduce new device to all existing linked devices (and vice versa)
      const existingDevices = await getLinkedInstallations()
      const ownPublicKey = await getPublicKey()

      for (const device of existingDevices) {
        if (device.installation_id === uuid || device.installation_id === installData.id) continue
        if (!device.public_key || !ownPublicKey) continue

        try {
          // Tell existing device about the new device
          const encForExisting = await rsaEncrypt(
            new TextEncoder().encode(JSON.stringify({ uuid })).buffer as ArrayBuffer,
            device.public_key
          )
          await syncApi.postInit(
            { uuid: device.installation_id, payload: JSON.stringify({ msg: arrayBufferToBase64Url(encForExisting), publicKey }) },
            installData.jwt
          )

          // Tell new device about the existing device
          const encForNew = await rsaEncrypt(
            new TextEncoder().encode(JSON.stringify({ uuid: device.installation_id })).buffer as ArrayBuffer,
            publicKey
          )
          await syncApi.postInit(
            { uuid: uuid, payload: JSON.stringify({ msg: arrayBufferToBase64Url(encForNew), publicKey: device.public_key }) },
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
    await syncApi.deleteInit({ uuid: installData.id, ids: processedIds }, installData.jwt)
  }

  return { newDevices, done: false }
}
