/**
 * Test script to demonstrate MCP superpowers
 * Shows the difference between basic and MCP-enhanced verification
 */
require('dotenv').config();

const MCPOrchestrator = require('./services/mcp/MCPOrchestrator');

async function testMCPSuperpowers() {
  console.log('🔥 Testing MCP Superpowers!');
  console.log('=' .repeat(50));

  const orchestrator = new MCPOrchestrator();
  
  try {
    // Initialize MCP orchestrator
    console.log('🔧 Initializing MCP Orchestrator...');
    await orchestrator.initialize();
    
    console.log('\n📊 Available MCP Capabilities:');
    const capabilities = orchestrator.listCapabilities();
    capabilities.forEach(cap => {
      console.log(`  🎯 ${cap.capability} (${cap.serverCount} server${cap.serverCount > 1 ? 's' : ''})`);
    });

    console.log('\n🚀 Testing MCP Capabilities...\n');

    // Test 1: File Operations
    console.log('📁 Test 1: File System Operations');
    try {
      const fileResult = await orchestrator.executeCapability('file_operations', {
        action: 'list_directory',
        path: process.cwd(),
        recursive: false
      });
      
      if (fileResult.summary.successful > 0) {
        const result = fileResult.results[0].result.result;
        console.log(`  ✅ Listed ${result.entries.length} items in current directory`);
        console.log(`  📂 Found directories: ${result.entries.filter(e => e.type === 'directory').length}`);
        console.log(`  📄 Found files: ${result.entries.filter(e => e.type === 'file').length}`);
      }
    } catch (error) {
      console.log(`  ❌ File operations failed: ${error.message}`);
    }

    // Test 2: Web Automation (if available)
    console.log('\n🌐 Test 2: Web Automation');
    try {
      const webResult = await orchestrator.executeCapability('web_automation', {
        url: 'https://example.com',
        extract_links: true,
        extract_images: false
      });
      
      if (webResult.summary.successful > 0) {
        const result = webResult.results[0].result.result;
        console.log(`  ✅ Scraped ${result.url}`);
        console.log(`  📰 Page title: "${result.content.title}"`);
        console.log(`  🔗 Found ${result.content.links?.length || 0} links`);
      }
    } catch (error) {
      console.log(`  ❌ Web automation failed: ${error.message}`);
    }

    // Test 3: Code Management (if GitHub token available)
    console.log('\n💻 Test 3: Code Management');
    if (process.env.GITHUB_TOKEN) {
      try {
        const codeResult = await orchestrator.executeCapability('code_management', {
          action: 'list_repositories',
          type: 'owner',
          per_page: 5
        });
        
        if (codeResult.summary.successful > 0) {
          const result = codeResult.results[0].result.result;
          console.log(`  ✅ Found ${result.repositories.length} repositories`);
          result.repositories.slice(0, 3).forEach(repo => {
            console.log(`    📦 ${repo.name} (${repo.language || 'No language'}, ${repo.stars} stars)`);
          });
        }
      } catch (error) {
        console.log(`  ❌ Code management failed: ${error.message}`);
      }
    } else {
      console.log('  ⚠️  GitHub token not found, skipping code management test');
    }

    // Test 4: Smart Routing
    console.log('\n🎯 Test 4: Smart Intent Routing');
    
    const testQueries = [
      {
        intent: 'I want to read the package.json file',
        context: { type: 'file_operation' },
        expected: 'file_operations'
      },
      {
        intent: 'Search for JavaScript repositories on GitHub',
        context: { type: 'code_search' },
        expected: 'code_management'
      },
      {
        intent: 'Scrape the latest news from a website',
        context: { type: 'web_scraping' },
        expected: 'web_automation'
      }
    ];

    for (const query of testQueries) {
      try {
        const routingResult = await orchestrator.smartRoute({
          intent: query.intent,
          context: query.context,
          parameters: {}
        });
        
        console.log(`  🎯 Intent: "${query.intent}"`);
        console.log(`  📍 Routed to: ${routingResult.capabilities.join(', ')}`);
        console.log(`  ✅ Success: ${routingResult.results.some(r => r.summary.successful > 0)}`);
        console.log('');
      } catch (error) {
        console.log(`  ❌ Smart routing failed for "${query.intent}": ${error.message}`);
      }
    }

    // Test 5: System Statistics
    console.log('📊 Test 5: System Statistics');
    const stats = orchestrator.getStats();
    console.log(`  🏗️  Total servers: ${stats.totalServers}`);
    console.log(`  ✅ Healthy servers: ${stats.healthyServers}`);
    console.log(`  ❌ Unhealthy servers: ${stats.unhealthyServers}`);
    console.log(`  🎯 Total capabilities: ${Object.keys(stats.capabilities).length}`);
    
    console.log('\n🔥 MCP Server Status:');
    stats.serverStats.forEach(server => {
      const emoji = server.status === 'healthy' ? '✅' : '❌';
      console.log(`  ${emoji} ${server.name}: ${server.status}`);
      console.log(`     Capabilities: ${server.capabilities.join(', ')}`);
    });

    console.log('\n🎉 MCP Superpowers Demonstration Complete!');
    console.log('=' .repeat(50));
    console.log('Your bullshit detector now has:');
    console.log('🔥 Real-time web scraping capabilities');
    console.log('📁 Local file system operations');
    console.log('💻 GitHub repository management');
    console.log('🗄️  Database query capabilities (PostgreSQL)');
    console.log('🎯 Smart capability routing');
    console.log('⚡ Multi-source parallel verification');
    console.log('🧠 AI-powered context detection');
    
  } catch (error) {
    console.error('❌ MCP test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    await orchestrator.cleanup();
  }
}

// Run the test
testMCPSuperpowers().catch(console.error);