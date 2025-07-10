/**
 * PostgreSQL MCP Server
 * Provides natural language database operations and SQL query capabilities
 */
const BaseMCPServer = require('../BaseMCPServer');
const { Pool } = require('pg');

class PostgreSQLMCP extends BaseMCPServer {
  constructor(config = {}) {
    super({
      name: 'PostgreSQL MCP',
      version: '1.0.0',
      description: 'Natural language database operations and SQL query capabilities',
      capabilities: [
        'database_query',
        'execute_sql',
        'describe_table',
        'list_tables',
        'get_schema',
        'create_table',
        'insert_data',
        'update_data',
        'delete_data',
        'natural_language_query',
        'database_stats',
        'backup_table',
        'restore_table'
      ]
    });

    // Database configuration
    this.config = {
      host: config.host || process.env.POSTGRES_HOST || 'localhost',
      port: config.port || process.env.POSTGRES_PORT || 5432,
      database: config.database || process.env.POSTGRES_DB || 'postgres',
      user: config.user || process.env.POSTGRES_USER || 'postgres',
      password: config.password || process.env.POSTGRES_PASSWORD,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };

    this.pool = null;
    this.connected = false;
    this.schema = new Map(); // Cache table schemas
    this.queryHistory = [];
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      this.pool = new Pool(this.config);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.connected = true;
      this.log('info', `Connected to PostgreSQL database: ${this.config.database}`);
      
      // Load initial schema
      await this.loadSchema();
      
      await super.initialize();
    } catch (error) {
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  /**
   * Execute PostgreSQL capability
   */
  async execute(capability, parameters = {}) {
    if (!this.connected) {
      throw new Error('PostgreSQL MCP not connected');
    }

    return this.executeWithMetrics(capability, parameters, async (cap, params) => {
      switch (cap) {
        case 'database_query':
        case 'execute_sql':
          return await this.executeSql(params);
        case 'describe_table':
          return await this.describeTable(params);
        case 'list_tables':
          return await this.listTables(params);
        case 'get_schema':
          return await this.getSchema(params);
        case 'create_table':
          return await this.createTable(params);
        case 'insert_data':
          return await this.insertData(params);
        case 'update_data':
          return await this.updateData(params);
        case 'delete_data':
          return await this.deleteData(params);
        case 'natural_language_query':
          return await this.naturalLanguageQuery(params);
        case 'database_stats':
          return await this.getDatabaseStats(params);
        case 'backup_table':
          return await this.backupTable(params);
        case 'restore_table':
          return await this.restoreTable(params);
        default:
          throw new Error(`Unknown capability: ${cap}`);
      }
    });
  }

  /**
   * Execute raw SQL query
   */
  async executeSql(params) {
    this.validateParameters(params, {
      query: { type: 'string', required: true },
      values: { type: 'object', required: false },
      safe_mode: { type: 'boolean', required: false }
    });

    const query = params.query.trim();
    const values = params.values || [];
    const safeMode = params.safe_mode !== false;

    // Safety checks in safe mode
    if (safeMode) {
      this.validateSafeQuery(query);
    }

    const startTime = Date.now();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(query, values);
      const executionTime = Date.now() - startTime;
      
      // Log query for history
      this.addToQueryHistory(query, values, executionTime, true);
      
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        command: result.command,
        fields: result.fields?.map(field => ({
          name: field.name,
          dataTypeID: field.dataTypeID,
          dataTypeSize: field.dataTypeSize
        })),
        executionTime,
        query: query
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.addToQueryHistory(query, values, executionTime, false, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Describe table structure
   */
  async describeTable(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      schema: { type: 'string', required: false }
    });

    const schema = params.schema || 'public';
    const tableName = params.table_name;

    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        ordinal_position
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;

    const result = await this.executeSql({
      query,
      values: [schema, tableName],
      safe_mode: false
    });

    // Get table constraints
    const constraintsQuery = `
      SELECT 
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = $1 AND tc.table_name = $2
    `;

    const constraintsResult = await this.executeSql({
      query: constraintsQuery,
      values: [schema, tableName],
      safe_mode: false
    });

    return {
      table: tableName,
      schema: schema,
      columns: result.rows,
      constraints: constraintsResult.rows,
      total_columns: result.rowCount
    };
  }

  /**
   * List all tables
   */
  async listTables(params) {
    this.validateParameters(params, {
      schema: { type: 'string', required: false },
      include_views: { type: 'boolean', required: false }
    });

    const schema = params.schema || 'public';
    const includeViews = params.include_views || false;

    const tableTypes = includeViews ? "('BASE TABLE', 'VIEW')" : "('BASE TABLE')";
    
    const query = `
      SELECT 
        table_name,
        table_type,
        table_schema
      FROM information_schema.tables 
      WHERE table_schema = $1 
        AND table_type IN ${tableTypes}
      ORDER BY table_name
    `;

    const result = await this.executeSql({
      query,
      values: [schema],
      safe_mode: false
    });

    // Get row counts for each table
    const tablesWithCounts = await Promise.all(
      result.rows.map(async (table) => {
        try {
          if (table.table_type === 'BASE TABLE') {
            const countResult = await this.executeSql({
              query: `SELECT COUNT(*) as row_count FROM "${schema}"."${table.table_name}"`,
              safe_mode: false
            });
            table.row_count = parseInt(countResult.rows[0].row_count);
          } else {
            table.row_count = null;
          }
        } catch (error) {
          table.row_count = 'Error';
        }
        return table;
      })
    );

    return {
      schema: schema,
      tables: tablesWithCounts,
      total: tablesWithCounts.length
    };
  }

  /**
   * Get database schema
   */
  async getSchema(params) {
    this.validateParameters(params, {
      schema: { type: 'string', required: false },
      detailed: { type: 'boolean', required: false }
    });

    const schema = params.schema || 'public';
    const detailed = params.detailed || false;

    // Get tables
    const tables = await this.listTables({ schema, include_views: true });
    
    if (!detailed) {
      return tables;
    }

    // Get detailed information for each table
    const detailedTables = await Promise.all(
      tables.tables.map(async (table) => {
        try {
          const tableDetails = await this.describeTable({
            table_name: table.table_name,
            schema: schema
          });
          return {
            ...table,
            columns: tableDetails.columns,
            constraints: tableDetails.constraints
          };
        } catch (error) {
          return {
            ...table,
            error: error.message
          };
        }
      })
    );

    return {
      schema: schema,
      tables: detailedTables,
      total: detailedTables.length
    };
  }

  /**
   * Create table
   */
  async createTable(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      columns: { type: 'object', required: true },
      schema: { type: 'string', required: false },
      if_not_exists: { type: 'boolean', required: false }
    });

    const schema = params.schema || 'public';
    const tableName = params.table_name;
    const columns = params.columns;
    const ifNotExists = params.if_not_exists || false;

    // Build column definitions
    const columnDefs = columns.map(col => {
      let def = `"${col.name}" ${col.type}`;
      if (col.primary_key) def += ' PRIMARY KEY';
      if (col.not_null) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.default) def += ` DEFAULT ${col.default}`;
      return def;
    }).join(', ');

    const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS' : '';
    const query = `CREATE TABLE ${ifNotExistsClause} "${schema}"."${tableName}" (${columnDefs})`;

    const result = await this.executeSql({
      query,
      safe_mode: false
    });

    // Refresh schema cache
    await this.loadSchema();

    return {
      table: tableName,
      schema: schema,
      created: true,
      columns: columns.length
    };
  }

  /**
   * Insert data
   */
  async insertData(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      data: { type: 'object', required: true },
      schema: { type: 'string', required: false },
      on_conflict: { type: 'string', required: false }
    });

    const schema = params.schema || 'public';
    const tableName = params.table_name;
    const data = Array.isArray(params.data) ? params.data : [params.data];
    const onConflict = params.on_conflict || '';

    if (data.length === 0) {
      throw new Error('No data provided for insertion');
    }

    // Get column names from first row
    const columns = Object.keys(data[0]);
    const columnNames = columns.map(col => `"${col}"`).join(', ');
    
    // Build values placeholders
    const valuePlaceholders = data.map((_, rowIndex) => {
      const rowPlaceholders = columns.map((_, colIndex) => 
        `$${rowIndex * columns.length + colIndex + 1}`
      ).join(', ');
      return `(${rowPlaceholders})`;
    }).join(', ');

    // Flatten data values
    const values = data.flatMap(row => columns.map(col => row[col]));

    const onConflictClause = onConflict ? ` ON CONFLICT ${onConflict}` : '';
    const query = `
      INSERT INTO "${schema}"."${tableName}" (${columnNames})
      VALUES ${valuePlaceholders}
      ${onConflictClause}
    `;

    const result = await this.executeSql({
      query,
      values,
      safe_mode: false
    });

    return {
      table: tableName,
      schema: schema,
      inserted: result.rowCount,
      rows: data.length
    };
  }

  /**
   * Update data
   */
  async updateData(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      data: { type: 'object', required: true },
      where: { type: 'string', required: true },
      where_values: { type: 'object', required: false },
      schema: { type: 'string', required: false }
    });

    const schema = params.schema || 'public';
    const tableName = params.table_name;
    const data = params.data;
    const whereClause = params.where;
    const whereValues = params.where_values || [];

    // Build SET clause
    const columns = Object.keys(data);
    const setClause = columns.map((col, index) => 
      `"${col}" = $${index + 1}`
    ).join(', ');

    // Build complete query
    const values = [...Object.values(data), ...whereValues];
    const query = `
      UPDATE "${schema}"."${tableName}"
      SET ${setClause}
      WHERE ${whereClause}
    `;

    const result = await this.executeSql({
      query,
      values,
      safe_mode: false
    });

    return {
      table: tableName,
      schema: schema,
      updated: result.rowCount,
      where: whereClause
    };
  }

  /**
   * Delete data
   */
  async deleteData(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      where: { type: 'string', required: true },
      where_values: { type: 'object', required: false },
      schema: { type: 'string', required: false },
      confirm: { type: 'boolean', required: true }
    });

    if (!params.confirm) {
      throw new Error('Delete operation requires explicit confirmation (confirm: true)');
    }

    const schema = params.schema || 'public';
    const tableName = params.table_name;
    const whereClause = params.where;
    const whereValues = params.where_values || [];

    const query = `DELETE FROM "${schema}"."${tableName}" WHERE ${whereClause}`;

    const result = await this.executeSql({
      query,
      values: whereValues,
      safe_mode: false
    });

    return {
      table: tableName,
      schema: schema,
      deleted: result.rowCount,
      where: whereClause
    };
  }

  /**
   * Natural language query processing
   */
  async naturalLanguageQuery(params) {
    this.validateParameters(params, {
      question: { type: 'string', required: true },
      schema: { type: 'string', required: false },
      explain: { type: 'boolean', required: false }
    });

    const question = params.question.toLowerCase();
    const schema = params.schema || 'public';
    const explain = params.explain || false;

    // Simple natural language to SQL conversion
    const sql = this.convertNaturalLanguageToSQL(question, schema);
    
    if (!sql) {
      throw new Error('Could not convert natural language query to SQL');
    }

    const result = await this.executeSql({
      query: sql,
      safe_mode: true
    });

    const response = {
      question: params.question,
      sql_query: sql,
      result: result,
      interpretation: this.explainQuery(sql)
    };

    if (explain) {
      const explainResult = await this.executeSql({
        query: `EXPLAIN ANALYZE ${sql}`,
        safe_mode: false
      });
      response.execution_plan = explainResult.result.rows;
    }

    return response;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(params) {
    this.validateParameters(params, {
      schema: { type: 'string', required: false }
    });

    const schema = params.schema || 'public';

    // Database size
    const dbSizeQuery = `
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
    `;

    // Table sizes
    const tableSizesQuery = `
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables 
      WHERE schemaname = $1
      ORDER BY size_bytes DESC
      LIMIT 10
    `;

    // Connection stats
    const connectionStatsQuery = `
      SELECT 
        COUNT(*) as total_connections,
        COUNT(*) FILTER (WHERE state = 'active') as active_connections,
        COUNT(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity
    `;

    const [dbSize, tableSizes, connectionStats] = await Promise.all([
      this.executeSql({ query: dbSizeQuery, safe_mode: false }),
      this.executeSql({ query: tableSizesQuery, values: [schema], safe_mode: false }),
      this.executeSql({ query: connectionStatsQuery, safe_mode: false })
    ]);

    return {
      database_size: dbSize.result.rows[0].database_size,
      table_sizes: tableSizes.result.rows,
      connections: connectionStats.result.rows[0],
      query_history: this.queryHistory.slice(-10), // Last 10 queries
      schema: schema
    };
  }

  /**
   * Backup table data
   */
  async backupTable(params) {
    this.validateParameters(params, {
      table_name: { type: 'string', required: true },
      schema: { type: 'string', required: false },
      format: { type: 'string', required: false }
    });

    const schema = params.schema || 'public';
    const tableName = params.table_name;
    const format = params.format || 'json';

    // Get all data from table
    const query = `SELECT * FROM "${schema}"."${tableName}"`;
    const result = await this.executeSql({
      query,
      safe_mode: false
    });

    const backup = {
      table: tableName,
      schema: schema,
      timestamp: new Date().toISOString(),
      row_count: result.rowCount,
      format: format,
      data: result.rows
    };

    return backup;
  }

  /**
   * Restore table data
   */
  async restoreTable(params) {
    this.validateParameters(params, {
      backup_data: { type: 'object', required: true },
      truncate_first: { type: 'boolean', required: false },
      confirm: { type: 'boolean', required: true }
    });

    if (!params.confirm) {
      throw new Error('Restore operation requires explicit confirmation (confirm: true)');
    }

    const backupData = params.backup_data;
    const truncateFirst = params.truncate_first || false;

    if (!backupData.table || !backupData.data) {
      throw new Error('Invalid backup data format');
    }

    const schema = backupData.schema || 'public';
    const tableName = backupData.table;

    // Truncate table if requested
    if (truncateFirst) {
      await this.executeSql({
        query: `TRUNCATE TABLE "${schema}"."${tableName}"`,
        safe_mode: false
      });
    }

    // Insert backup data
    const insertResult = await this.insertData({
      table_name: tableName,
      schema: schema,
      data: backupData.data,
      on_conflict: 'DO NOTHING'
    });

    return {
      table: tableName,
      schema: schema,
      restored_rows: insertResult.inserted,
      backup_timestamp: backupData.timestamp,
      truncated_first: truncateFirst
    };
  }

  /**
   * Validate query safety
   */
  validateSafeQuery(query) {
    const dangerousKeywords = [
      'DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 
      'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', '\\copy'
    ];
    
    const upperQuery = query.toUpperCase();
    
    for (const keyword of dangerousKeywords) {
      if (upperQuery.includes(keyword)) {
        throw new Error(`Potentially dangerous query detected. Contains: ${keyword}. Use safe_mode: false to override.`);
      }
    }
  }

  /**
   * Convert natural language to SQL (basic implementation)
   */
  convertNaturalLanguageToSQL(question, schema) {
    // Very basic natural language processing
    const words = question.toLowerCase().split(' ');
    
    // Find table names in question
    const tableNames = Array.from(this.schema.keys()).filter(table => 
      words.some(word => word.includes(table.toLowerCase()))
    );
    
    if (tableNames.length === 0) {
      return null;
    }
    
    const tableName = tableNames[0];
    
    // Basic patterns
    if (words.includes('count') || words.includes('how many')) {
      return `SELECT COUNT(*) FROM "${schema}"."${tableName}"`;
    }
    
    if (words.includes('all') || words.includes('show') || words.includes('list')) {
      return `SELECT * FROM "${schema}"."${tableName}" LIMIT 100`;
    }
    
    if (words.includes('recent') || words.includes('latest')) {
      return `SELECT * FROM "${schema}"."${tableName}" ORDER BY created_at DESC LIMIT 10`;
    }
    
    // Default to showing table structure
    return `SELECT * FROM "${schema}"."${tableName}" LIMIT 10`;
  }

  /**
   * Explain SQL query
   */
  explainQuery(sql) {
    const upperSql = sql.toUpperCase();
    
    if (upperSql.startsWith('SELECT COUNT')) {
      return 'Counting the total number of rows in the table';
    }
    
    if (upperSql.includes('ORDER BY')) {
      return 'Selecting and sorting data from the table';
    }
    
    if (upperSql.includes('LIMIT')) {
      return 'Selecting a limited number of rows from the table';
    }
    
    return 'Executing a database query';
  }

  /**
   * Load database schema into cache
   */
  async loadSchema() {
    try {
      const tables = await this.listTables({ include_views: false });
      
      for (const table of tables.tables) {
        const tableInfo = await this.describeTable({
          table_name: table.table_name,
          schema: table.table_schema
        });
        
        this.schema.set(table.table_name, tableInfo);
      }
      
      this.log('info', `Loaded schema for ${this.schema.size} tables`);
    } catch (error) {
      this.log('warn', `Failed to load schema: ${error.message}`);
    }
  }

  /**
   * Add query to history
   */
  addToQueryHistory(query, values, executionTime, success, error = null) {
    this.queryHistory.push({
      query,
      values,
      executionTime,
      success,
      error,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 queries
    if (this.queryHistory.length > 100) {
      this.queryHistory.shift();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.connected) {
        return {
          healthy: false,
          error: 'Not connected to database'
        };
      }

      // Test query
      await this.executeSql({
        query: 'SELECT 1 as health_check',
        safe_mode: false
      });
      
      return {
        healthy: true,
        connected: this.connected,
        database: this.config.database,
        schema_tables: this.schema.size,
        ...await super.healthCheck()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        connected: false
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      this.log('info', 'PostgreSQL connection pool closed');
    }
    
    this.schema.clear();
    this.queryHistory = [];
    
    await super.cleanup();
  }
}

module.exports = PostgreSQLMCP;