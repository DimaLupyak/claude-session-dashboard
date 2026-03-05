import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import {
  SettingsSchema,
  DEFAULT_SETTINGS,
  type Settings,
} from './settings.types'

const SETTINGS_DIR = '.claude-dashboard'
const SETTINGS_FILE = 'settings.json'

function getSettingsPath(): string {
  return path.join(os.homedir(), SETTINGS_DIR, SETTINGS_FILE)
}

function getSettingsDir(): string {
  return path.join(os.homedir(), SETTINGS_DIR)
}

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Settings> => {
    const filePath = getSettingsPath()

    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const json = JSON.parse(raw) as unknown
      const result = SettingsSchema.safeParse(json)

      if (result.success) {
        return result.data
      }

      // Corrupt or invalid file -- return defaults
      console.warn('Invalid settings file, using defaults:', result.error.message)
      return DEFAULT_SETTINGS
    } catch {
      // File does not exist or is unreadable -- return defaults
      return DEFAULT_SETTINGS
    }
  },
)

export const saveSettings = createServerFn({ method: 'POST' })
  .inputValidator((input: Settings) => {
    const result = SettingsSchema.parse(input)
    return result
  })
  .handler(async ({ data }): Promise<Settings> => {
    const settingsWithTimestamp: Settings = {
      ...data,
      updatedAt: new Date().toISOString(),
    }

    const dir = getSettingsDir()
    const filePath = getSettingsPath()
    const tmpPath = filePath + '.tmp'

    try {
      // Ensure directory exists
      fs.mkdirSync(dir, { recursive: true })

      // Atomic write: write to tmp file, then rename
      fs.writeFileSync(tmpPath, JSON.stringify(settingsWithTimestamp, null, 2), 'utf-8')
      fs.renameSync(tmpPath, filePath)

      return settingsWithTimestamp
    } catch (error) {
      // Cleanup tmp file if it exists
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath)
        }
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(
        `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  })
