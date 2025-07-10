// Enhanced source icon mapping system
import { 
  Globe, 
  Shield, 
  Newspaper, 
  Smartphone, 
  Building, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Search,
  Github,
  Database,
  Cloud,
  Zap,
  Mail,
  FileText,
  Phone,
  CreditCard,
  MapPin,
  MessageCircle,
  Video,
  Lock,
  Eye,
  Target,
  Briefcase,
  Users,
  Star,
  Calendar,
  BookOpen,
  Camera,
  Play,
  ShoppingCart,
  Heart,
  Flag,
  Award,
  Truck,
  Home,
  Wallet,
  Coffee,
  Gamepad2,
  Music,
  Book,
  School,
  Car,
  Plane,
  Ship,
  Train
} from 'lucide-react';

// Comprehensive source categorization with both icons and colors
export const SOURCE_CATEGORIES = {
  // Official/Government
  GOVERNMENT: {
    icon: Building,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    keywords: ['gov', 'government', 'official', 'federal', 'state', 'municipal', 'irs', 'fbi', 'sec', 'ftc'],
    priority: 10
  },

  // Financial Institutions
  FINANCIAL: {
    icon: CreditCard,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-200',
    keywords: ['bank', 'credit', 'visa', 'mastercard', 'paypal', 'stripe', 'financial', 'chase', 'wells', 'bofa', 'citi'],
    priority: 9
  },

  // Technology Companies
  TECH: {
    icon: Smartphone,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-200',
    keywords: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'facebook', 'twitter', 'instagram', 'linkedin', 'github', 'android', 'ios'],
    priority: 8
  },

  // News & Media
  NEWS: {
    icon: Newspaper,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-200',
    keywords: ['news', 'bbc', 'cnn', 'reuters', 'ap', 'nytimes', 'wsj', 'guardian', 'post', 'times', 'tribune', 'herald', 'journal'],
    priority: 7
  },

  // Security & Verification
  SECURITY: {
    icon: Shield,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-200',
    keywords: ['security', 'verify', 'scam', 'fraud', 'antivirus', 'norton', 'mcafee', 'kaspersky', 'checkpoint', 'cert'],
    priority: 8
  },

  // Social Media
  SOCIAL: {
    icon: MessageCircle,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    borderColor: 'border-pink-200',
    keywords: ['social', 'facebook', 'twitter', 'instagram', 'linkedin', 'tiktok', 'snapchat', 'youtube', 'reddit', 'discord'],
    priority: 6
  },

  // E-commerce
  ECOMMERCE: {
    icon: ShoppingCart,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    borderColor: 'border-indigo-200',
    keywords: ['shop', 'store', 'ebay', 'amazon', 'walmart', 'target', 'bestbuy', 'etsy', 'shopify', 'commerce'],
    priority: 6
  },

  // Telecommunications
  TELECOM: {
    icon: Phone,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    borderColor: 'border-cyan-200',
    keywords: ['att', 'verizon', 'tmobile', 'sprint', 'phone', 'wireless', 'cellular', 'telecom'],
    priority: 7
  },

  // Email Services
  EMAIL: {
    icon: Mail,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-200',
    keywords: ['gmail', 'yahoo', 'hotmail', 'outlook', 'email', 'mail'],
    priority: 5
  },

  // Search Engines
  SEARCH: {
    icon: Search,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    keywords: ['google', 'bing', 'duckduckgo', 'search', 'engine'],
    priority: 6
  },

  // Development/Technical
  DEVELOPER: {
    icon: Github,
    color: 'text-gray-800',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    keywords: ['github', 'stackoverflow', 'dev', 'api', 'docs', 'technical'],
    priority: 5
  },

  // MCP/AI Enhanced
  MCP: {
    icon: Zap,
    color: 'text-purple-500',
    bgColor: 'bg-gradient-to-br from-purple-100 to-pink-100',
    borderColor: 'border-purple-200',
    keywords: ['mcp', 'ai', 'enhanced'],
    priority: 10,
    animated: true
  },

  // Default/Unknown
  DEFAULT: {
    icon: Globe,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    keywords: [],
    priority: 1
  }
};

// Status-specific styling
export const STATUS_STYLES = {
  VERIFIED: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-200',
    label: 'Verified',
    emoji: '✅'
  },
  CONTRADICTED: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-200',
    label: 'Contradicted',
    emoji: '❌'
  },
  INSUFFICIENT_DATA: {
    icon: Eye,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-200',
    label: 'Insufficient Data',
    emoji: '❓'
  },
  ERROR: {
    icon: AlertTriangle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
    label: 'Error',
    emoji: '⚠️'
  },
  PENDING: {
    icon: Target,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-200',
    label: 'Processing...',
    emoji: '⏳'
  }
};

// Enhanced source categorization function
export const categorizeSource = (sourceName, sourceData = {}) => {
  const name = (sourceName || '').toLowerCase();
  const url = (sourceData?.url || '').toLowerCase();
  const domain = (sourceData?.domain || '').toLowerCase();
  const searchText = `${name} ${url} ${domain}`.toLowerCase();

  // Find matching category based on keywords
  for (const [categoryName, category] of Object.entries(SOURCE_CATEGORIES)) {
    if (categoryName === 'DEFAULT') continue;
    
    const hasMatch = category.keywords.some(keyword => 
      searchText.includes(keyword)
    );
    
    if (hasMatch) {
      return {
        ...category,
        categoryName
      };
    }
  }

  return {
    ...SOURCE_CATEGORIES.DEFAULT,
    categoryName: 'DEFAULT'
  };
};

// Main source icon component generator
export const getSourceIconConfig = (source) => {
  const category = categorizeSource(source.name || source.source, source.data);
  const status = STATUS_STYLES[source.status] || STATUS_STYLES.PENDING;
  
  return {
    category,
    status,
    confidence: source.confidence || 0,
    isHighPriority: category.priority >= 8,
    isMCP: category.categoryName === 'MCP' || source.type === 'MCP',
    displayName: formatSourceName(source.name || source.source)
  };
};

// Format source names for display
export const formatSourceName = (sourceName) => {
  if (!sourceName) return 'Unknown Source';
  
  // Clean up common source name patterns
  return sourceName
    .replace(/^(web_search_|mcp_|api_)/, '') // Remove prefixes
    .replace(/_/g, ' ')                      // Replace underscores with spaces
    .replace(/\b\w/g, l => l.toUpperCase())  // Title case
    .trim();
};

// Generate CSS classes for styling
export const getSourceClasses = (iconConfig) => {
  const { category, status, isHighPriority, isMCP } = iconConfig;
  
  // Build classes as single strings to avoid multi-line issues
  const containerClasses = [
    'group relative overflow-hidden rounded-xl border transition-all duration-200',
    category.borderColor,
    category.bgColor,
    'hover:border-blue-300 hover:shadow-md'
  ];
  
  if (isHighPriority) {
    containerClasses.push('ring-2 ring-opacity-20');
    containerClasses.push(category.color.replace('text-', 'ring-'));
  }
  
  if (isMCP) {
    containerClasses.push('bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200');
  }
  
  const iconClasses = [
    'w-8 h-8 rounded-lg flex items-center justify-center',
    isMCP ? 'bg-gradient-to-br from-purple-100 to-pink-100' : category.bgColor
  ];
  
  const statusBadgeClasses = [
    'inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full',
    status.bgColor,
    status.color,
    status.borderColor,
    'border'
  ];
  
  const confidenceBadgeClasses = [
    'flex items-center text-sm',
    category.color
  ];
  
  const mcpBadgeClasses = isMCP ? [
    'px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded animate-pulse'
  ] : [];
  
  const hoverEffectClasses = [
    'absolute bottom-0 left-0 right-0 h-1',
    'bg-gradient-to-r from-blue-400 to-purple-400',
    'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
  ];
  
  return {
    container: containerClasses.join(' '),
    icon: iconClasses.join(' '),
    iconElement: `w-5 h-5 ${category.color}`,
    statusBadge: statusBadgeClasses.join(' '),
    confidenceBadge: confidenceBadgeClasses.join(' '),
    mcpBadge: mcpBadgeClasses.join(' '),
    hoverEffect: hoverEffectClasses.join(' ')
  };
};

export default {
  SOURCE_CATEGORIES,
  STATUS_STYLES,
  categorizeSource,
  getSourceIconConfig,
  formatSourceName,
  getSourceClasses
};
