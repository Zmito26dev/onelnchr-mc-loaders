import axios from 'axios';
import fs from 'fs';
import path from 'path';
import xml from 'xml2js';

import type { ModLoader } from 'tomate-mods';
import type { LaunchConfig } from '..';
import { InvalidVersionError } from '../errors';

export const id = 'forge';

export const url = 'https://files.minecraftforge.net/';

export async function downloadForge(forgeFilePath: string, loaderVersion: string) {
  fs.mkdirSync(path.dirname(forgeFilePath), { recursive: true });

  const downloadLink = getDownloadLink(loaderVersion);

  try {
    const response = await axios.get(downloadLink, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);
    await fs.promises.writeFile(forgeFilePath, buffer);

  } catch (error) {
    console.error('Error downloading Forge:', error);
  }
}

export async function getMavenMetadata() {
  const metadataUrl =
    'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
  const response = await axios.get(metadataUrl);
  const xmlData = response.data;

  const { metadata } = await xml.parseStringPromise(xmlData);
  return metadata;
}

/**
 * Returns all loader versions. Note that these might not be available for all game versions
 * On forge they are structured like this: `${gameVersion}-${loaderVersion}`
 */
export async function listAllLoaderVersions(): Promise<
  `${string}-${string}`[]
> {
  const metadata = await getMavenMetadata();
  return metadata.versioning[0].versions[0].version;
}

/**
 * Returns all loader versions that are available for a given game version.
 * On forge they are structured like this: `${gameVersion}-${loaderVersion}`
 */
export async function listLoaderVersions(gameVersion: string) {
  const versions = await listAllLoaderVersions();
  const filteredVersions = versions.filter((version) =>
    version.includes(gameVersion + '-')
  );

  return filteredVersions;
}

function getDownloadLink(loaderVersion: string) {
  const split = loaderVersion.split('.');
  const minor = split[1];
  const t = split.pop();

  if (
    minor &&
    parseInt(minor) <= 12 &&
    (loaderVersion.split('-')[0] !== '1.12.2' || (t && parseInt(t) <= 2847))
  ) {
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${loaderVersion}/forge-${loaderVersion}-universal.jar`;
  } else {
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${loaderVersion}/forge-${loaderVersion}-installer.jar`;
  }
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
    `forge-${config.gameVersion}-${config.loaderVersion}`,
    'forge.jar'
  );

  await downloadForge(versionPath, config.loaderVersion);

  return {
    root: config.rootPath,
    clientPackage: null as never,
    version: {
      number: config.gameVersion,
      type: 'release',
      custom: `forge-${config.gameVersion}-${config.loaderVersion}`,
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
    const version = versions[i].split('-')[0];
    supportedVersions.add(version);
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
  modrinthCategories: ['forge'],
  curseforgeCategory: '1',
};
