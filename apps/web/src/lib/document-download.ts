import { readDeptFromStorage } from './dept'
import { fallbackDepartment, isDepartmentAllowed } from './auth'
import { keycloak } from './keycloak'

type DownloadDocumentOptions = {
  url: string
  filename: string
}

export async function downloadDocument({ url, filename }: DownloadDocumentOptions): Promise<void> {
  await keycloak.updateToken(30)

  const storedDept = readDeptFromStorage(fallbackDepartment())
  const headers: Record<string, string> = {
    'x-dept': isDepartmentAllowed(storedDept) ? storedDept : fallbackDepartment(),
  }

  if (keycloak.token) {
    headers.Authorization = `Bearer ${keycloak.token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Document request failed with status ${response.status}`)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)

  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
