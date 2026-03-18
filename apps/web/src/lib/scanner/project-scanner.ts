import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getProjectsDir,
  getProjectsDirFor,
  getDataSources,
  decodeProjectDirName,
  extractProjectName,
} from '../utils/claude-path'
import type { DataSource } from '../utils/claude-path'

export interface ProjectInfo {
  dirName: string
  decodedPath: string
  projectName: string
  sessionFiles: string[]
  /** Which DataSource this came from, e.g. 'primary', 'wsl-ubuntu-user' */
  sourceId?: string
  /** Display label for the source, e.g. 'Windows', 'WSL - Ubuntu' */
  sourceLabel?: string
}

export async function scanProjects(): Promise<ProjectInfo[]> {
  const projectsDir = getProjectsDir()

  let entries: string[]
  try {
    entries = await fs.promises.readdir(projectsDir)
  } catch {
    return []
  }

  const projects: ProjectInfo[] = []

  for (const dirName of entries) {
    const dirPath = path.join(projectsDir, dirName)
    const stat = await fs.promises.stat(dirPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const files = await fs.promises.readdir(dirPath).catch(() => [] as string[])
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'))

    if (sessionFiles.length === 0) continue

    const decodedPath = decodeProjectDirName(dirName)
    projects.push({
      dirName,
      decodedPath,
      projectName: extractProjectName(decodedPath),
      sessionFiles,
    })
  }

  return projects
}

export async function scanProjectsFrom(source: DataSource): Promise<ProjectInfo[]> {
  const projectsDir = getProjectsDirFor(source)

  let entries: string[]
  try {
    entries = await fs.promises.readdir(projectsDir)
  } catch {
    return []
  }

  const projects: ProjectInfo[] = []

  for (const dirName of entries) {
    const dirPath = path.join(projectsDir, dirName)
    const stat = await fs.promises.stat(dirPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const files = await fs.promises.readdir(dirPath).catch(() => [] as string[])
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'))

    if (sessionFiles.length === 0) continue

    const decodedPath = decodeProjectDirName(dirName)
    projects.push({
      dirName,
      decodedPath,
      projectName: extractProjectName(decodedPath),
      sessionFiles,
      sourceId: source.id,
      sourceLabel: source.label,
    })
  }

  return projects
}

export async function scanAllProjects(): Promise<ProjectInfo[]> {
  const sources = await getDataSources()
  const allProjects: ProjectInfo[] = []

  for (const source of sources) {
    if (!source.available) continue
    const projects = await scanProjectsFrom(source)
    allProjects.push(...projects)
  }

  return allProjects
}
