import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AUTH_STORAGE_KEYS } from '../types/auth'

export function ShareLinkCapture({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  const isSharePath = location.pathname === '/share'

  useEffect(() => {
    if (!isSharePath) return

    const params = new URLSearchParams(location.search)
    const uuid = params.get('uuid')

    if (uuid) {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, uuid)
    }

    navigate('/', { replace: true })
  }, [isSharePath, location.search, navigate])

  if (isSharePath) {
    return null
  }

  return <>{children}</>
}
