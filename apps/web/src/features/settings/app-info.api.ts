import * as fs from 'node:fs'
import * as path from 'node:path'
import { createServerFn } from '@tanstack/react-start'

export interface AppInfo {
  version: string
  appPath: string
  nodeEnv: string
}

export const getAppInfo = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppInfo> => {
    let version = 'unknown'
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json')
      const raw = fs.readFileSync(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw) as { version?: string }
      version = pkg.version ?? 'unknown'
    } catch {
      // Fall back to unknown if package.json is unreadable
    }

    return {
      version,
      appPath: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
    }
  },
)
