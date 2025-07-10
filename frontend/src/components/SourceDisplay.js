// Enhanced Source Display Component
import React, { useState } from 'react';
import { ExternalLink, Info, Clock, TrendingUp } from 'lucide-react';
import { getSourceIconConfig, getSourceClasses } from '../utils/sourceIcons';

const SourceDisplay = ({ sources, title = "Sources Verified", showDetails = true }) => {
  const [expandedSource, setExpandedSource] = useState(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h4 className="font-bold text-gray-900 mb-3 flex items-center">
        <div className="w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded mr-2 flex items-center justify-center">
          <span className="text-white text-xs">🔗</span>
        </div>
        {title}
        <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
          {sources.length}
        </span>
      </h4>
      
      <div className="space-y-3">
        {sources.map((source, index) => {
          const iconConfig = getSourceIconConfig(source);
          const classes = getSourceClasses(iconConfig);
          const isExpanded = expandedSource === index;
          
          return (
            <div key={index} className={classes.container}>
              <div className="p-4">
                {/* Main source row */}
                <div className="flex items-center justify-between">
                  {/* Left side - Icon and name */}
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {/* Source icon */}
                    <div className={classes.icon}>
                      <iconConfig.category.icon className={classes.iconElement} />
                    </div>
                    
                    {/* Source info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-900 truncate">
                          {iconConfig.displayName}
                        </span>
                        
                        {/* MCP Badge */}
                        {iconConfig.isMCP && (
                          <span className={classes.mcpBadge}>
                            MCP
                          </span>
                        )}
                        
                        {/* High Priority Indicator */}
                        {iconConfig.isHighPriority && (
                          <span className="text-yellow-500">⭐</span>
                        )}
                        
                        {/* Status emoji */}
                        <span className="text-lg">
                          {iconConfig.status.emoji}
                        </span>
                      </div>
                      
                      {/* Source description/analysis preview */}
                      {source.data?.analysis && (
                        <p className="text-sm text-gray-600 truncate">
                          {source.data.analysis}
                        </p>
                      )}
                      
                      {/* Error message */}
                      {source.error && (
                        <p className="text-sm text-red-600 truncate">
                          ⚠️ {source.error}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Right side - Status and confidence */}
                  <div className="flex items-center space-x-3 flex-shrink-0">
                    {/* Confidence score */}
                    <div className={classes.confidenceBadge}>
                      <TrendingUp className="w-4 h-4 mr-1" />
                      <span className="font-medium">
                        {Math.round(iconConfig.confidence * 100)}%
                      </span>
                    </div>
                    
                    {/* Status badge */}
                    <span className={classes.statusBadge}>
                      {iconConfig.status.label}
                    </span>
                    
                    {/* Expand button for details */}
                    {showDetails && (source.data?.sources || source.data?.findings) && (
                      <button
                        onClick={() => setExpandedSource(isExpanded ? null : index)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="View details"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Expandable details section */}
                {isExpanded && showDetails && (
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                    {/* Sub-sources with links */}
                    {source.data?.sources && source.data.sources.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">
                          Reference Links:
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {source.data.sources.slice(0, 5).map((src, srcIdx) => (
                            <a
                              key={srcIdx}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded-md transition-colors max-w-[200px]"
                              title={`View source from ${src.domain || new URL(src.url).hostname}`}
                            >
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                {src.title || src.domain || new URL(src.url).hostname}
                              </span>
                            </a>
                          ))}
                          {source.data.sources.length > 5 && (
                            <span className="text-xs text-gray-500 px-2 py-1">
                              +{source.data.sources.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Detailed findings */}
                    {source.data?.findings && source.data.findings.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">
                          Key Findings:
                        </h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {source.data.findings.map((finding, findingIndex) => (
                            <li key={findingIndex} className="flex items-start">
                              <span className="text-blue-500 mr-2 flex-shrink-0">•</span>
                              <span>{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* Suspicion score details */}
                    {source.data?.suspicionScore !== undefined && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Suspicion Analysis:
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            source.data.suspicionScore >= 60 ? 'bg-red-100 text-red-800' :
                            source.data.suspicionScore >= 30 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {source.data.suspicionScore}/100
                          </span>
                        </div>
                        
                        {/* Suspicion score progress bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${
                              source.data.suspicionScore >= 60 ? 'bg-red-500' :
                              source.data.suspicionScore >= 30 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${source.data.suspicionScore}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Performance timing */}
                    {source.timing && (
                      <div className="text-xs text-gray-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        Completed in {((source.timing.end - source.timing.start) / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Hover effect gradient */}
              <div className={classes.hoverEffect} />
            </div>
          );
        })}
      </div>
      
      {/* Summary statistics */}
      {sources.length > 1 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <div className="font-bold text-blue-600">
                {sources.filter(s => s.status === 'VERIFIED').length}
              </div>
              <div className="text-gray-600">Verified</div>
            </div>
            <div>
              <div className="font-bold text-red-600">
                {sources.filter(s => s.status === 'CONTRADICTED').length}
              </div>
              <div className="text-gray-600">Contradicted</div>
            </div>
            <div>
              <div className="font-bold text-purple-600">
                {sources.filter(s => getSourceIconConfig(s).isMCP).length}
              </div>
              <div className="text-gray-600">MCP Enhanced</div>
            </div>
            <div>
              <div className="font-bold text-gray-600">
                {Math.round(sources.reduce((acc, s) => acc + (s.confidence || 0), 0) / sources.length * 100)}%
              </div>
              <div className="text-gray-600">Avg. Confidence</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SourceDisplay;
