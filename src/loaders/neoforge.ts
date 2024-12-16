import axios from 'axios';
import fs from 'fs';
import path from 'path';
import xml from 'xml2js';

import type { ModLoader } from 'tomate-mods';
import type { LaunchConfig } from '..';
import { InvalidVersionError } from '../errors';

export const id = 'neoforge';

export const url = 'https://neoforged.net/';

export async function downloadNeoForge(neoForgeFilePath: string, loaderVersion: string) {
  fs.mkdirSync(path.dirname(neoForgeFilePath), { recursive: true });

  const downloadLink = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  
  try {
    const response = await axios.get(downloadLink, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);
    await fs.promises.writeFile(neoForgeFilePath, buffer);

  } catch (error) {
    console.error('Error downloading NeoForge:', error);
  }
}

export async function getMavenMetadata() {
  const metadataUrl =
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
  const response = await axios.get(metadataUrl);
  const xmlData = response.data;

  const { metadata } = await xml.parseStringPromise(xmlData);
  return metadata;
}

/**
 * Returns all loader versions. Note that these might not be available for all game versions
 * On forge they are structured like this: `${gameVersion.minor}.${gameVersion.patch}.${loaderVersion}`
 */
export async function listAllLoaderVersions(): Promise<
  `${string}.${string}.${string}`[]
> {
  const metadata = await getMavenMetadata();
  return metadata.versioning[0].versions[0].version;
}

/**
 * Returns all loader versions that are available for a given game version.
 * On forge they are structured like this: `${gameVersion.minor}.${gameVersion.patch}.${loaderVersion}`
 */
export async function listLoaderVersions(gameVersion: string) {
  const [_major, minor, patch] = gameVersion.split('.');

  const versions = await listAllLoaderVersions();

  const filteredVersions = versions.filter(
    (version) =>
      !version.includes('-beta') && version.includes(`${minor}.${patch}.`)
  );

  return filteredVersions;
}

/**
 * Downloads the latest version json and returns a partial MCLC config
 */
export async function getMCLCLaunchConfig(config: LaunchConfig) {
  if (!config.loaderVersion) {
    const [loaderVersion] = await listLoaderVersions(config.gameVersion);
    config.loaderVersion = loaderVersion;
  }

  if (!config.loaderVersion) {
    throw new InvalidVersionError(config.gameVersion);
  }

  const versionPath = path.join(
    config.rootPath,
    'versions',
    `neoforge-${config.gameVersion}-${config.loaderVersion}`,
    'neoforge.jar'
  );

  await downloadNeoForge(versionPath, config.loaderVersion);

  return {
    root: config.rootPath,
    clientPackage: null as never,
    version: {
      number: config.gameVersion,
      type: 'release',
      custom: `neoforge-${config.gameVersion}-${config.loaderVersion}`,
    },
    forge: versionPath,
  };
}

/**
 * Returns all game versions a loader supports
 */
export async function listSupportedGameVersions() {
  const metadata = await getMavenMetadata();
  const versions: string[] = metadata.versioning[0].versions[0].version;

  const supportedVersions = new Set<string>();

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];

    // Filter out beta versions
    if (version.includes('-beta')) {
      continue;
    }

    const [major, minor] = version.split('.');

    supportedVersions.add(`1.${major}.${minor}`);
  }

  return Array.from(supportedVersions).map((v) => ({
    version: v,
    stable: true,
  }));
}

/**
 * The loader config for the 'tomate-mods' package
 */
export const tomateModsModLoader: ModLoader = {
  overrideMods: {},
  modrinthCategories: ['neoforge'],
  curseforgeCategory: '6',
};
