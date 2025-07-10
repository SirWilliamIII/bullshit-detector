/**
 * File System MCP Server
 * Provides secure file operations with configurable access controls
 */
const BaseMCPServer = require('../BaseMCPServer');
const fs = require('fs').promises;
const path = require('path');
const { createHash } = require('crypto');

class FileSystemMCP extends BaseMCPServer {
  constructor(config = {}) {
    super({
      name: 'FileSystem MCP',
      version: '1.0.0',
      description: 'Secure file operations with configurable access controls',
      capabilities: [
        'file_operations',
        'read_file',
        'write_file',
        'list_directory',
        'create_directory',
        'delete_file',
        'copy_file',
        'move_file',
        'file_search',
        'file_stats'
      ]
    });

    // Security configuration
    this.allowedPaths = config.allowedPaths || [process.cwd()];
    this.blockedPaths = config.blockedPaths || ['/etc', '/usr', '/bin', '/sbin'];
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.allowedExtensions = config.allowedExtensions || null; // null = all allowed
    this.blockedExtensions = config.blockedExtensions || ['.exe', '.bat', '.sh', '.ps1'];
    
    this.fileCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Execute file system capability
   */
  async execute(capability, parameters = {}) {
    return this.executeWithMetrics(capability, parameters, async (cap, params) => {
      switch (cap) {
        case 'file_operations':
        case 'read_file':
          return await this.readFile(params);
        case 'write_file':
          return await this.writeFile(params);
        case 'list_directory':
          return await this.listDirectory(params);
        case 'create_directory':
          return await this.createDirectory(params);
        case 'delete_file':
          return await this.deleteFile(params);
        case 'copy_file':
          return await this.copyFile(params);
        case 'move_file':
          return await this.moveFile(params);
        case 'file_search':
          return await this.searchFiles(params);
        case 'file_stats':
          return await this.getFileStats(params);
        default:
          throw new Error(`Unknown capability: ${cap}`);
      }
    });
  }

  /**
   * Read file contents
   */
  async readFile(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true },
      encoding: { type: 'string', required: false },
      maxSize: { type: 'number', required: false }
    });

    const filePath = this.validatePath(params.path);
    const encoding = params.encoding || 'utf8';
    const maxSize = params.maxSize || this.maxFileSize;

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > maxSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
    }

    // Check cache
    const cacheKey = this.getCacheKey('read', filePath, stats.mtime);
    if (this.fileCache.has(cacheKey)) {
      this.log('info', `Cache hit for ${filePath}`);
      return this.fileCache.get(cacheKey);
    }

    // Read file
    const content = await fs.readFile(filePath, encoding);
    
    // Cache result
    this.cacheResult(cacheKey, {
      content,
      size: stats.size,
      encoding,
      lastModified: stats.mtime,
      path: filePath
    });

    return {
      content,
      size: stats.size,
      encoding,
      lastModified: stats.mtime,
      path: filePath
    };
  }

  /**
   * Write file contents
   */
  async writeFile(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true },
      content: { type: 'string', required: true },
      encoding: { type: 'string', required: false },
      createDirs: { type: 'boolean', required: false }
    });

    const filePath = this.validatePath(params.path, true);
    const content = params.content;
    const encoding = params.encoding || 'utf8';
    const createDirs = params.createDirs || false;

    // Check content size
    const contentSize = Buffer.byteLength(content, encoding);
    if (contentSize > this.maxFileSize) {
      throw new Error(`Content too large: ${contentSize} bytes (max: ${this.maxFileSize})`);
    }

    // Create directories if needed
    if (createDirs) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // Write file
    await fs.writeFile(filePath, content, encoding);
    
    // Clear cache for this file
    this.clearFileCache(filePath);

    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      size: stats.size,
      encoding,
      created: stats.birthtime,
      modified: stats.mtime
    };
  }

  /**
   * List directory contents
   */
  async listDirectory(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true },
      recursive: { type: 'boolean', required: false },
      includeHidden: { type: 'boolean', required: false },
      pattern: { type: 'string', required: false }
    });

    const dirPath = this.validatePath(params.path);
    const recursive = params.recursive || false;
    const includeHidden = params.includeHidden || false;
    const pattern = params.pattern ? new RegExp(params.pattern) : null;

    const entries = [];

    const scanDirectory = async (currentPath, depth = 0) => {
      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files unless requested
        if (!includeHidden && item.name.startsWith('.')) {
          continue;
        }

        // Apply pattern filter
        if (pattern && !pattern.test(item.name)) {
          continue;
        }

        const fullPath = path.join(currentPath, item.name);
        const relativePath = path.relative(dirPath, fullPath);
        
        try {
          const stats = await fs.stat(fullPath);
          
          const entry = {
            name: item.name,
            path: relativePath,
            fullPath,
            type: item.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            depth
          };

          entries.push(entry);

          // Recurse into subdirectories
          if (recursive && item.isDirectory() && depth < 10) { // Limit depth
            await scanDirectory(fullPath, depth + 1);
          }
        } catch (error) {
          this.log('warn', `Error scanning ${fullPath}: ${error.message}`);
        }
      }
    };

    await scanDirectory(dirPath);

    return {
      directory: dirPath,
      entries,
      count: entries.length,
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Create directory
   */
  async createDirectory(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true },
      recursive: { type: 'boolean', required: false }
    });

    const dirPath = this.validatePath(params.path, true);
    const recursive = params.recursive !== false;

    await fs.mkdir(dirPath, { recursive });

    const stats = await fs.stat(dirPath);
    
    return {
      path: dirPath,
      created: stats.birthtime,
      recursive
    };
  }

  /**
   * Delete file
   */
  async deleteFile(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true },
      force: { type: 'boolean', required: false }
    });

    const filePath = this.validatePath(params.path);
    const force = params.force || false;

    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      if (force) {
        await fs.rmdir(filePath, { recursive: true });
      } else {
        throw new Error('Path is a directory. Use force=true to delete directories');
      }
    } else {
      await fs.unlink(filePath);
    }

    // Clear cache
    this.clearFileCache(filePath);

    return {
      path: filePath,
      deleted: true,
      wasDirectory: stats.isDirectory(),
      size: stats.size
    };
  }

  /**
   * Copy file
   */
  async copyFile(params) {
    this.validateParameters(params, {
      source: { type: 'string', required: true },
      destination: { type: 'string', required: true },
      overwrite: { type: 'boolean', required: false }
    });

    const sourcePath = this.validatePath(params.source);
    const destPath = this.validatePath(params.destination, true);
    const overwrite = params.overwrite || false;

    // Check if destination exists
    try {
      await fs.access(destPath);
      if (!overwrite) {
        throw new Error('Destination exists and overwrite is false');
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }

    // Check source file size
    const sourceStats = await fs.stat(sourcePath);
    if (sourceStats.size > this.maxFileSize) {
      throw new Error(`Source file too large: ${sourceStats.size} bytes`);
    }

    // Create destination directory if needed
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    // Copy file
    await fs.copyFile(sourcePath, destPath);

    const destStats = await fs.stat(destPath);

    return {
      source: sourcePath,
      destination: destPath,
      size: destStats.size,
      copied: true
    };
  }

  /**
   * Move file
   */
  async moveFile(params) {
    this.validateParameters(params, {
      source: { type: 'string', required: true },
      destination: { type: 'string', required: true },
      overwrite: { type: 'boolean', required: false }
    });

    const sourcePath = this.validatePath(params.source);
    const destPath = this.validatePath(params.destination, true);
    const overwrite = params.overwrite || false;

    // Check if destination exists
    try {
      await fs.access(destPath);
      if (!overwrite) {
        throw new Error('Destination exists and overwrite is false');
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }

    // Create destination directory if needed
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    // Move file
    await fs.rename(sourcePath, destPath);

    // Clear cache
    this.clearFileCache(sourcePath);

    const destStats = await fs.stat(destPath);

    return {
      source: sourcePath,
      destination: destPath,
      size: destStats.size,
      moved: true
    };
  }

  /**
   * Search for files
   */
  async searchFiles(params) {
    this.validateParameters(params, {
      directory: { type: 'string', required: true },
      pattern: { type: 'string', required: true },
      maxResults: { type: 'number', required: false },
      includeContent: { type: 'boolean', required: false }
    });

    const dirPath = this.validatePath(params.directory);
    const pattern = new RegExp(params.pattern, 'i');
    const maxResults = params.maxResults || 100;
    const includeContent = params.includeContent || false;

    const results = [];

    const searchDirectory = async (currentPath, depth = 0) => {
      if (results.length >= maxResults || depth > 10) return;

      const items = await fs.readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(currentPath, item.name);
        
        try {
          // Check if name matches pattern
          if (pattern.test(item.name)) {
            const stats = await fs.stat(fullPath);
            
            const result = {
              name: item.name,
              path: fullPath,
              type: item.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime,
              matchType: 'filename'
            };

            // Include content if requested and it's a text file
            if (includeContent && item.isFile() && this.isTextFile(item.name)) {
              try {
                const content = await fs.readFile(fullPath, 'utf8');
                if (pattern.test(content)) {
                  result.content = content.substring(0, 1000); // Limit content
                  result.matchType = 'content';
                }
              } catch (error) {
                // Ignore content read errors
              }
            }

            results.push(result);
          }

          // Recurse into directories
          if (item.isDirectory()) {
            await searchDirectory(fullPath, depth + 1);
          }
        } catch (error) {
          this.log('warn', `Error searching ${fullPath}: ${error.message}`);
        }
      }
    };

    await searchDirectory(dirPath);

    return {
      directory: dirPath,
      pattern: params.pattern,
      results,
      totalFound: results.length,
      searchedAt: new Date().toISOString()
    };
  }

  /**
   * Get file statistics
   */
  async getFileStats(params) {
    this.validateParameters(params, {
      path: { type: 'string', required: true }
    });

    const filePath = this.validatePath(params.path);
    const stats = await fs.stat(filePath);

    return {
      path: filePath,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode,
      uid: stats.uid,
      gid: stats.gid
    };
  }

  /**
   * Validate file path against security constraints
   */
  validatePath(filePath, isWrite = false) {
    // Resolve absolute path
    const absolutePath = path.resolve(filePath);
    
    // Check if path is within allowed directories
    const isAllowed = this.allowedPaths.some(allowedPath => 
      absolutePath.startsWith(path.resolve(allowedPath))
    );
    
    if (!isAllowed) {
      throw new Error(`Path not allowed: ${absolutePath}`);
    }
    
    // Check if path is in blocked directories
    const isBlocked = this.blockedPaths.some(blockedPath => 
      absolutePath.startsWith(path.resolve(blockedPath))
    );
    
    if (isBlocked) {
      throw new Error(`Path blocked: ${absolutePath}`);
    }
    
    // Check file extension
    const ext = path.extname(absolutePath).toLowerCase();
    
    if (this.allowedExtensions && !this.allowedExtensions.includes(ext)) {
      throw new Error(`File extension not allowed: ${ext}`);
    }
    
    if (this.blockedExtensions.includes(ext)) {
      throw new Error(`File extension blocked: ${ext}`);
    }
    
    return absolutePath;
  }

  /**
   * Check if file is likely a text file
   */
  isTextFile(filename) {
    const textExtensions = ['.txt', '.js', '.ts', '.json', '.md', '.html', '.css', '.xml', '.yml', '.yaml'];
    const ext = path.extname(filename).toLowerCase();
    return textExtensions.includes(ext);
  }

  /**
   * Generate cache key
   */
  getCacheKey(operation, filePath, mtime) {
    const data = `${operation}:${filePath}:${mtime.getTime()}`;
    return createHash('md5').update(data).digest('hex');
  }

  /**
   * Cache result with TTL
   */
  cacheResult(key, result) {
    this.fileCache.set(key, result);
    
    // Auto-expire cache entries
    setTimeout(() => {
      this.fileCache.delete(key);
    }, this.cacheTimeout);
  }

  /**
   * Clear cache for specific file
   */
  clearFileCache(filePath) {
    for (const [key, value] of this.fileCache.entries()) {
      if (value.path === filePath) {
        this.fileCache.delete(key);
      }
    }
  }

  /**
   * Get capability schemas
   */
  getCapabilitySchema(capability) {
    const schemas = {
      read_file: {
        path: { type: 'string', required: true, description: 'File path to read' },
        encoding: { type: 'string', required: false, description: 'File encoding (default: utf8)' }
      },
      write_file: {
        path: { type: 'string', required: true, description: 'File path to write' },
        content: { type: 'string', required: true, description: 'File content' },
        encoding: { type: 'string', required: false, description: 'File encoding (default: utf8)' }
      },
      list_directory: {
        path: { type: 'string', required: true, description: 'Directory path to list' },
        recursive: { type: 'boolean', required: false, description: 'List recursively' }
      }
    };
    
    return schemas[capability] || {};
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.fileCache.clear();
    await super.cleanup();
  }
}

module.exports = FileSystemMCP;