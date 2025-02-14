const screenshot = require('screenshot-desktop');
const { createWorker } = require('tesseract.js');
const logger = require('./logger');
const fetch = require('node-fetch');

class ProductivityAnalyzer {
    constructor(categories, appsMap) {
        this.API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli";
        this.headers = { 
            "Authorization": "Bearer " + process.env.HUGGINGFACE_TOKEN,
            "Content-Type": "application/json"
        };
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000;
        this.worker = null;
        this.isInitializing = false;
        this.lastOCRTime = 0;
        this.OCR_COOLDOWN = 10000; // Increase to 10 seconds between OCR operations
        this.lastProgress = 0;
        this.PROGRESS_THRESHOLD = 20; // Only log every 20% progress
        this.isProcessing = false;
        
        // Store the categories and apps map
        this.productiveCategories = categories;
        this.productiveAppsMap = appsMap;

        this.analysisQueue = [];
        this.isAnalyzing = false;
        this.ANALYSIS_COOLDOWN = 5000; // 5 seconds between analyses
        this.lastAnalysisTime = 0;
        this.OCR_ENABLED = false; // Keep OCR disabled initially
        this.OCR_RETRY_COUNT = 0;
        this.MAX_OCR_RETRIES = 3;
        this.isInitializing = false;
        
        // Don't initialize OCR worker in constructor
        // It will be initialized on first use if needed

        // Add dynamic apps list
        this.dynamicApps = new Set([
            'youtube.com',
            'spotify',
            'netflix',
            'twitch',
            'udemy',
            'coursera',
            'pluralsight',
            'chatgpt',
            'chat.openai.com',
            'github.com',
            'stackoverflow.com',
            'docs.microsoft.com',
            'developer.mozilla.org',
            'medium.com'
        ]);

        // Reduce cache timeout for dynamic apps
        this.dynamicAppCacheTimeout = 10 * 1000; // 10 seconds
        this.standardCacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Add development platforms to productive categories
        this.developmentPlatforms = new Set([
            'chatgpt',
            'chat.openai.com',
            'github',
            'stackoverflow',
            'vscode',
            'visual studio code'
        ]);
    }

    async initializeWorker() {
        if (this.worker || this.isInitializing) return;
        
        try {
            this.isInitializing = true;
            this.worker = await createWorker({
                logger: m => {
                    if (m.status === 'recognizing text' && !this.isProcessing) {
                        const progress = Math.round(m.progress * 100);
                        // Only log significant progress changes
                        if (progress >= this.lastProgress + this.PROGRESS_THRESHOLD) {
                            logger.info(`OCR Progress: ${progress}%`);
                            this.lastProgress = progress;
                            if (progress >= 100) {
                                this.isProcessing = true;
                            }
                        }
                    }
                }
            });
            await this.worker.loadLanguage('eng');
            await this.worker.initialize('eng');
            logger.info('Tesseract worker initialized');
        } catch (error) {
            logger.logError(error, 'Worker initialization failed');
            this.worker = null;
        } finally {
            this.isInitializing = false;
            this.lastProgress = 0;
        }
    }

    async analyzeProductivity(activeWindow) {
        try {
            const currentTime = Date.now();
            const windowTitle = activeWindow?.title || '';
            const processName = activeWindow?.owner?.name || '';

            // Check if this is a dynamic app
            const isDynamicApp = this.isDynamicContent(processName, windowTitle);
            const cacheTimeout = isDynamicApp ? this.dynamicAppCacheTimeout : this.standardCacheTimeout;

            logger.debug('Starting productivity analysis', {
                metadata: { 
                    processName, 
                    windowTitle,
                    isDynamicApp,
                    cacheTimeout: `${cacheTimeout/1000}s`
                }
            });

            // Generate cache key including content hash for dynamic apps
            const cacheKey = await this.generateCacheKey(processName, windowTitle, isDynamicApp);
            const cachedResult = this.cache.get(cacheKey);

            // Only use cache for non-dynamic apps or very recent dynamic app results
            if (cachedResult && (currentTime - cachedResult.timestamp) < cacheTimeout) {
                logger.debug('Using cached result', { 
                    metadata: { 
                        isProductive: cachedResult.result.isProductive,
                        category: cachedResult.result.category,
                        isDynamicApp
                    }
                });
                return cachedResult.result;
            }

            // 2. Check cooldown to prevent too frequent analyses
            if (currentTime - this.lastAnalysisTime < this.ANALYSIS_COOLDOWN) {
                return this.lastResult || this.fallbackAnalysis(activeWindow);
            }

            this.lastAnalysisTime = currentTime;

            // 3. Try OCR first if enabled
            let screenContent = '';
            if (this.OCR_ENABLED && this.worker && 
                (currentTime - this.lastOCRTime > this.OCR_COOLDOWN)) {
                try {
                    screenContent = await this.performOCR(activeWindow);
                    logger.debug('OCR completed', { 
                        metadata: { textLength: screenContent.length } 
                    });
                } catch (ocrError) {
                    logger.logError(ocrError, 'OCR failed');
                }
            }

            // 4. Prepare context with window info and OCR content
            const context = `
                Application: ${processName}
                Window Title: ${windowTitle}
                ${screenContent ? `Screen Content: ${screenContent.substring(0, 500)}` : ''}
            `.trim();

            // 5. Classify content using AI
            let analysisResult = await this.classifyContent(context, processName, windowTitle);
            
            // 6. Log the analysis result
            logger.logAnalysis({
                processName,
                windowTitle,
                isProductive: analysisResult.isProductive,
                confidence: analysisResult.confidence,
                category: analysisResult.category,
                hasOCR: Boolean(screenContent)
            });

            // 7. Cache the result
            this.cache.set(cacheKey, {
                result: analysisResult,
                timestamp: currentTime
            });
            this.lastResult = analysisResult;

            return analysisResult;

        } catch (error) {
            logger.logError(error, 'Productivity analysis failed');
            return this.fallbackAnalysis(activeWindow);
        }
    }

    isDynamicContent(processName, windowTitle) {
        const lowerProcessName = processName.toLowerCase();
        const lowerWindowTitle = windowTitle.toLowerCase();
        
        return this.dynamicApps.has(lowerProcessName) || 
               Array.from(this.dynamicApps).some(app => 
                   lowerWindowTitle.includes(app));
    }

    async generateCacheKey(processName, windowTitle, isDynamicApp) {
        if (!isDynamicApp) {
            return `${processName}:${windowTitle}`;
        }

        // For dynamic apps, include a content hash
        let screenContent = '';
        if (this.worker) {
            try {
                screenContent = await this.performOCR({ owner: { name: processName }, title: windowTitle });
            } catch (error) {
                logger.debug('OCR failed for dynamic content hash', { error: error.message });
            }
        }

        // Create a simple hash of the content
        const contentHash = this.hashString(screenContent || windowTitle);
        return `${processName}:${windowTitle}:${contentHash}`;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    async classifyContent(context, processName, windowTitle, usedOCR = false) {
        try {
            // First, check for known productive apps
            const quickCheck = this.productiveAppsMap.has(processName.toLowerCase()) ||
                Object.values(this.productiveCategories)
                    .some(cat => cat.apps.some(app => 
                        windowTitle.toLowerCase().includes(app.toLowerCase())));

            if (quickCheck) {
                return {
                    isProductive: true,
                    confidence: 0.9,
                    category: this.determineCategory(processName, windowTitle),
                    details: 'App-based classification'
                };
            }

            // Enhanced context building
            const enhancedContext = `
                Application Context:
                - Program: ${processName}
                - Window: ${windowTitle}
                ${context.includes('Screen Content:') ? context : ''}

                Task Analysis:
                This application/website is being used for:
                - Learning and skill development
                - Professional work and research
                - Project development and coding
                - Educational content consumption
                - Technical documentation and learning
                - Professional communication
                - Work-related research
                
                Considering these aspects, determine if this is a productive work/learning activity.
            `.trim();

            // Enhanced classification labels
            const response = await fetch(this.API_URL, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({
                    inputs: enhancedContext,
                    parameters: {
                        candidate_labels: [
                            "productive learning or work activity",
                            "educational or professional development",
                            "work-related research or documentation",
                            "non-productive leisure activity"
                        ],
                        multi_label: true,
                        aggregation_strategy: "weighted_average"
                    }
                })
            });

            const result = await response.json();

            if (result.error) {
                logger.error('API error', { metadata: result.error });
                return this.fallbackAnalysis({ owner: { name: processName }, title: windowTitle });
            }

            if (!result?.labels || !result?.scores) {
                logger.error('Invalid API response structure', { metadata: { result } });
                return this.fallbackAnalysis({ owner: { name: processName }, title: windowTitle });
            }

            // Consider the top 2 labels for better accuracy
            const productiveLabels = [
                "productive learning or work activity",
                "educational or professional development",
                "work-related research or documentation"
            ];

            const topLabels = result.labels.slice(0, 2);
            const topScores = result.scores.slice(0, 2);

            // Calculate weighted productivity score
            const isProductive = topLabels.some(label => productiveLabels.includes(label)) &&
                               topScores[0] > 0.4; // Adjusted threshold

            // Add additional context for dynamic apps
            if (this.isDynamicContent(processName, windowTitle)) {
                // Special handling for known platforms
                if (windowTitle.toLowerCase().includes('chatgpt')) {
                    return {
                        isProductive: true,
                        confidence: 0.85,
                        category: 'Development Tools',
                        details: 'AI-assisted development'
                    };
                }
                
                if (windowTitle.toLowerCase().includes('github')) {
                    return {
                        isProductive: true,
                        confidence: 0.9,
                        category: 'Development',
                        details: 'Code repository work'
                    };
                }
            }

            return {
                isProductive,
                confidence: topScores[0],
                category: this.determineCategory(processName, windowTitle),
                details: `AI classification (${topLabels[0]})`
            };

        } catch (error) {
            logger.logError(error, 'Classification failed');
            return this.fallbackAnalysis({ owner: { name: processName }, title: windowTitle });
        }
    }

    async performOCR(activeWindow) {
        if (!this.worker && !this.isInitializing) {
            await this.initializeWorker();
        }

        if (!this.worker) {
            return '';
        }

        const screenshotBuffer = await screenshot();
        const { data } = await this.worker.recognize(screenshotBuffer);
        this.lastOCRTime = Date.now();
        return data.text;
    }

    determineCategory(processName, windowTitle) {
        // Use the class property instead of global variable
        for (const [category, data] of Object.entries(this.productiveCategories)) {
            if (data.apps.some(app => 
                processName.toLowerCase().includes(app.toLowerCase()) ||
                windowTitle.toLowerCase().includes(app.toLowerCase())
            )) {
                return data.name;
            }
        }
        return 'Uncategorized';
    }

    fallbackAnalysis(activeWindow) {
        if (!activeWindow || !activeWindow.owner || !activeWindow.owner.name) {
            return {
                isProductive: false,
                confidence: 0.5,
                category: 'Unknown',
                details: 'Fallback due to missing window info'
            };
        }

        const isProductive = this.productiveAppsMap.has(
            activeWindow.owner.name.toLowerCase()
        );
        
        return {
            isProductive,
            confidence: 0.7,
            category: this.determineCategory(
                activeWindow.owner.name,
                activeWindow.title || ''
            ),
            details: 'Using predefined app list'
        };
    }

    async cleanup() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }

    async getQuickAnalysis(activeWindow) {
        const windowTitle = activeWindow?.title || '';
        const processName = activeWindow?.owner?.name || '';

        // First check cache
        const cacheKey = `${processName}:${windowTitle}`;
        const cachedResult = this.cache.get(cacheKey);
        if (cachedResult && (Date.now() - cachedResult.timestamp) < this.cacheTimeout) {
            return cachedResult.result;
        }

        // If not in cache, do a quick check based on app name
        const category = this.determineCategory(processName, windowTitle);
        const isProductive = this.productiveAppsMap.has(processName.toLowerCase()) ||
                           Object.values(this.productiveCategories)
                               .some(cat => cat.apps.some(app => 
                                   windowTitle.toLowerCase().includes(app.toLowerCase())));

        return {
            isProductive,
            confidence: 0.7, // Lower confidence for quick results
            category,
            details: 'Quick analysis'
        };
    }

    async analyzeProductivityAsync(activeWindow) {
        try {
            // Full AI analysis
            return await this.analyzeProductivity(activeWindow);
        } catch (error) {
            logger.logError(error, 'Async analysis failed');
            return null;
        }
    }
}

module.exports = ProductivityAnalyzer;