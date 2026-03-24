import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class ProfileManager {
  private profilesDir: string;
  private chromeUserDataDir: string;

  constructor(profilesDir: string) {
    this.profilesDir = profilesDir;
    this.chromeUserDataDir = this.getChromeUserDataDir();
  }

  /**
   * Get Chrome user data directory based on OS
   */
  private getChromeUserDataDir(): string {
    const platform = process.platform;

    if (platform === 'win32') {
      const appDataPath = process.env.LOCALAPPDATA;
      if (!appDataPath) {
        throw new Error('LOCALAPPDATA environment variable not found');
      }
      return path.join(appDataPath, 'Google', 'Chrome', 'User Data');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    } else {
      // Linux
      return path.join(os.homedir(), '.config', 'google-chrome');
    }
  }

  /**
   * List available Chrome profiles
   */
  listProfiles(): string[] {
    try {
      const profilesDir = path.join(this.chromeUserDataDir, 'Local State');
      if (!fs.existsSync(profilesDir)) {
        logger.warn('Chrome profile directory not found');
        return [];
      }

      const items = fs.readdirSync(this.chromeUserDataDir).filter((item) => {
        const fullPath = path.join(this.chromeUserDataDir, item);
        return (
          fs.statSync(fullPath).isDirectory() &&
          (item.startsWith('Profile') || item === 'Default')
        );
      });

      return items;
    } catch (error) {
      logger.error({ error }, 'Error listing Chrome profiles');
      return [];
    }
  }

  /**
   * Check if Chrome is running (process check)
   */
  isChromeRunning(): boolean {
    try {
      const platform = process.platform;

      if (platform === 'win32') {
        const output = execSync('tasklist', { encoding: 'utf-8' });
        return output.includes('chrome.exe');
      } else if (platform === 'darwin') {
        const output = execSync('pgrep Chrome', { encoding: 'utf-8' });
        return output.length > 0;
      } else {
        const output = execSync('pgrep chrome', { encoding: 'utf-8' });
        return output.length > 0;
      }
    } catch {
      return false;
    }
  }

  /**
   * Copy profile from Chrome directory
   */
  async importProfile(sourceProfileName: string, targetName: string = 'agent-profile'): Promise<string> {
    const sourcePath = path.join(this.chromeUserDataDir, sourceProfileName);
    const targetPath = path.join(this.profilesDir, targetName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source profile not found: ${sourcePath}`);
    }

    if (this.isChromeRunning()) {
      throw new Error('Chrome is running. Please close Chrome before importing profile.');
    }

    logger.info(`Copying profile from ${sourcePath} to ${targetPath}`);

    // Create target directory
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }

    // Copy entire profile
    this.copyDirectory(sourcePath, targetPath);

    // Remove large/unnecessary directories
    const toRemove = ['Cache', 'Code Cache', 'GPUCache', 'Cache/Cache_Data'];
    for (const dir of toRemove) {
      const dirPath = path.join(targetPath, dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true });
        logger.debug(`Removed ${dir}`);
      }
    }

    logger.info(`Profile imported to ${targetPath}`);

    // Save metadata
    const metadata = {
      importedAt: new Date().toISOString(),
      sourceProfile: sourceProfileName,
      chromeVersion: this.getChromeVersion(),
    };

    fs.writeFileSync(
      path.join(this.profilesDir, 'profile-meta.json'),
      JSON.stringify(metadata, null, 2)
    );

    return targetPath;
  }

  /**
   * Create a new profile from scratch
   */
  async createProfile(name: string = 'agent-profile'): Promise<string> {
    const profilePath = path.join(this.profilesDir, name);

    if (fs.existsSync(profilePath)) {
      logger.warn(`Profile already exists: ${name}`);
      return profilePath;
    }

    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }

    logger.info(`Creating new profile: ${name}`);

    // Playwright will create the profile on first use
    // We just need to ensure the directory exists
    fs.mkdirSync(profilePath, { recursive: true });

    logger.info(`Profile created: ${profilePath}`);
    return profilePath;
  }

  /**
   * Get Chrome version
   */
  getChromeVersion(): string {
    try {
      const platform = process.platform;

      if (platform === 'win32') {
        const output = execSync('wmic datafile where name="C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe" get Version', {
          encoding: 'utf-8',
        });
        return output.split('\n')[1]?.trim() || 'unknown';
      } else if (platform === 'darwin') {
        const output = execSync(`/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version`, {
          encoding: 'utf-8',
        });
        return output.trim();
      } else {
        const output = execSync('google-chrome --version', { encoding: 'utf-8' });
        return output.trim();
      }
    } catch {
      return 'unknown';
    }
  }

  /**
   * Re-sync profile from source (e.g., refresh cookies)
   */
  async resyncProfile(sourceProfileName: string, targetName: string = 'agent-profile'): Promise<void> {
    logger.info(`Re-syncing profile ${targetName} from ${sourceProfileName}`);

    // Remove old profile
    const targetPath = path.join(this.profilesDir, targetName);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true });
    }

    // Re-import
    await this.importProfile(sourceProfileName, targetName);
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(source: string, destination: string): void {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const files = fs.readdirSync(source);

    for (const file of files) {
      const srcFile = path.join(source, file);
      const destFile = path.join(destination, file);

      if (fs.statSync(srcFile).isDirectory()) {
        this.copyDirectory(srcFile, destFile);
      } else {
        fs.copyFileSync(srcFile, destFile);
      }
    }
  }
}
