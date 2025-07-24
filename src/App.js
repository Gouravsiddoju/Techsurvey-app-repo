import React, { useState, useRef, useEffect, useCallback } from 'react'; // Added useCallback
import './App.css'; // Import the new App.css for styling

// List of randomized loading messages
const LOADING_MESSAGES = [
    "MODEL IS LOADING...",
    "MODEL IS GETTING READY...",
    "MODEL IS FUELING UP...",
    "ANALYZING PIXELS...",
    "CRUNCHING DATA...",
    "ALIGNING SATELLITES...",
    "PERFORMING ADVANCED CALCULATIONS...",
    "GENERATING INSIGHTS..."
];

// Main App component
const App = () => {
    // State variables for various UI elements and data
    const [locationDenied, setLocationDenied] = useState(true); // Simulates location access status
    const [chainage, setChainage] = useState(''); // Manual chainage input
    const [selectedFiles, setSelectedFiles] = useState([]); // Stores selected image files
    const [imagePreviews, setImagePreviews] = useState([]); // Stores URLs for image previews
    const [analysisResults, setAnalysisResults] = useState([]); // Stores results from backend
    const [loading, setLoading] = useState(false); // Loading state for analysis
    const [error, setError] = useState(null); // Error message state
    const [userLocation, setUserLocation] = useState({ lat: null, lon: null }); // User's GPS coordinates
    const fileInputRef = useRef(null); // Ref for hidden file input

    // LLM-related states
    const [imageDescriptions, setImageDescriptions] = useState({}); // Stores generated descriptions { filename: description }
    const [generatingDescriptionIndex, setGeneratingDescriptionIndex] = useState(null); // Index of image whose description is being generated
    const [overallSummary, setOverallSummary] = useState(''); // Stores the generated overall summary
    const [generatingSummary, setGeneratingSummary] = useState(false); // Loading state for overall summary

    // New state to track if images were taken by camera or uploaded from gallery
    const [imageSource, setImageSource] = useState(null); // 'camera' or 'gallery'

    // Define the backend URL for your Flask app
    const BACKEND_URL = 'http://192.168.1.53:8000'; // Your backend IP

    // Define the new LLM API URL
    const LLM_API_URL = "https://api.techoptima.ai/api/generate";
    const LLM_MODEL = "optgpt:7b"; // Model specified by the user

    // New states for server accessibility
    const [serverAccessible, setServerAccessible] = useState(false);
    const [serverStatusMessage, setServerStatusMessage] = useState('Checking backend server...');

    // States for enhanced loading experience
    const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
    const [loadingProgress, setLoadingProgress] = useState(0); // 0-100

    // State for expanding result item to show confidence scores
    const [expandedResultIndex, setExpandedResultIndex] = useState(null);

    // Function to check backend server accessibility
    const checkServerStatus = async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/`, { method: 'GET', signal: AbortSignal.timeout(5000) }); // 5-second timeout
            if (response.ok) {
                setServerAccessible(true);
                setServerStatusMessage('Accessible'); // Shorter message for display
            } else {
                setServerAccessible(false);
                setServerStatusMessage(`Not accessible (HTTP ${response.status})`);
            }
        } catch (err) {
            setServerAccessible(false);
            if (err.name === 'AbortError') {
                setServerStatusMessage('Check timed out');
            } else {
                setServerStatusMessage(`Not accessible (${err.message})`);
            }
            console.error("Error checking backend server:", err);
        }
    };

    // Function to get user's current location
    const getLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                    });
                    setLocationDenied(false);
                    setError(null);
                },
                (err) => {
                    console.error("Error getting location:", err);
                    setLocationDenied(true);
                    let errorMessage = "Location access denied by user.";
                    if (err.code === err.PERMISSION_DENIED) {
                        errorMessage = "Location access denied by user. Please enable location permissions in your browser/device settings.";
                    } else if (err.code === err.POSITION_UNAVAILABLE) {
                        errorMessage = "Location information is unavailable.";
                    } else if (err.code === err.TIMEOUT) {
                        errorMessage = "The request to get user location timed out.";
                    } else if (err.message) {
                        errorMessage = `Location error: ${err.message}`;
                    }
                    setError(errorMessage);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Increased timeout to 10 seconds
            );
        } else {
            setError("Geolocation is not supported by this browser.");
        }
    };

    // Effects on component mount
    useEffect(() => {
        getLocation();
        checkServerStatus(); // Check server status on load
    }, []);

    // Effect for loading animation and progress bar
    useEffect(() => {
        let messageInterval;
        let progressInterval;

        if (loading) {
            // Reset progress and message when loading starts
            setLoadingProgress(0);
            setLoadingMessage(LOADING_MESSAGES[0]);

            let messageIndex = 0;
            messageInterval = setInterval(() => {
                messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
                setLoadingMessage(LOADING_MESSAGES[messageIndex]);
            }, 1500); // Change message every 1.5 seconds

            // Simulate progress bar filling up over a fixed duration (e.g., 10 seconds)
            const totalDuration = 10000; // 10 seconds
            const updateInterval = 100; // Update every 100ms
            const steps = totalDuration / updateInterval;
            let currentStep = 0;

            progressInterval = setInterval(() => {
                currentStep++;
                const newProgress = Math.min(100, Math.round((currentStep / steps) * 100));
                setLoadingProgress(newProgress);

                if (currentStep >= steps) {
                    clearInterval(progressInterval);
                }
            }, updateInterval);

        } else {
            // Clear intervals when loading finishes
            clearInterval(messageInterval);
            clearInterval(progressInterval);
            setLoadingProgress(0); // Reset progress
            setLoadingMessage(LOADING_MESSAGES[0]); // Reset message
        }

        return () => {
            clearInterval(messageInterval);
            clearInterval(progressInterval);
        };
    }, [loading]);


    // Handle file selection from input or drag-and-drop
    const handleFileChange = (event) => {
        const files = event.target.files ? Array.from(event.target.files) : Array.from(event.dataTransfer.files);
        // Limit to 3 files as per backend
        const newFiles = files.slice(0, 3 - selectedFiles.length);

        setSelectedFiles((prevFiles) => [...prevFiles, ...newFiles]);

        // Generate previews for the new files
        const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
    };

    // Handle "Take Photo" button click
    const handleTakePhotoClick = () => {
        setImageSource('camera'); // Set source to camera
        if (fileInputRef.current) {
            fileInputRef.current.setAttribute('capture', 'environment'); // 'environment' for rear camera
            fileInputRef.current.click();
        }
    };

    // Handle "Upload Images" button click
    const handleUploadImagesClick = () => {
        setImageSource('gallery'); // Set source to gallery
        if (fileInputRef.current) {
            fileInputRef.current.removeAttribute('capture');
            fileInputRef.current.click();
        }
    };

    // Handle drag over event for drag-and-drop area
    const handleDragOver = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.add('drag-over'); // Add visual feedback
    };

    // Handle drag leave event for drag-and-drop area
    const handleDragLeave = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over'); // Remove visual feedback
    };

    // Handle drop event for drag-and-drop area
    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over'); // Remove visual feedback
        setImageSource('gallery'); // Set source to gallery for drag-and-drop
        handleFileChange(event);
    };

    // Reset function for "Upload Again" button
    const handleUploadAgain = () => {
        setSelectedFiles([]);
        setImagePreviews([]);
        setAnalysisResults([]);
        setChainage('');
        setImageDescriptions({});
        setOverallSummary('');
        setError(null);
        setExpandedResultIndex(null); // Reset expanded state
        // Re-check server status as part of reset, in case it was down
        checkServerStatus();
    };

    // Handle form submission for analysis
    const handleRunAnalysis = async () => {
        if (selectedFiles.length === 0) {
            setError("Please select at least one image for analysis.");
            return;
        }
        if (!serverAccessible) {
            setError("Cannot run analysis: Backend server is not accessible.");
            return;
        }

        setLoading(true); // Start loading animation
        setError(null);
        setAnalysisResults([]); // Clear previous results immediately
        setImageDescriptions({}); // Clear previous descriptions
        setOverallSummary(''); // Clear previous summary
        setExpandedResultIndex(null); // Collapse any expanded results

        const formData = new FormData();
        selectedFiles.forEach((file, index) => {
            formData.append(`image${index + 1}`, file);
            formData.append(`chainage_km_${index + 1}`, chainage || '');

            // Conditionally append lat and lon based on imageSource
            if (imageSource === 'camera' && userLocation.lat !== null && userLocation.lon !== null) {
                formData.append(`lat${index + 1}`, userLocation.lat);
                formData.append(`lon${index + 1}`, userLocation.lon);
            } else {
                // If from gallery or location denied, send empty strings or omit
                formData.append(`lat${index + 1}`, '');
                formData.append(`lon${index + 1}`, '');
            }
        });

        try {
            const response = await fetch(`${BACKEND_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setAnalysisResults(data.results);
        } catch (err) {
            console.error("Error during analysis:", err);
            setError(`Failed to run analysis: ${err.message}. Make sure your backend is running at ${BACKEND_URL}.`);
        } finally {
            setLoading(false); // Stop loading animation
        }
    };

    // Function to generate description for a single image using the new LLM API
    const generateImageDescription = async (result, index) => {
        setGeneratingDescriptionIndex(index);
        setError(null);

        const prompt = `Analyze the following survey image data and provide a concise, professional description of the scene in a single paragraph. Focus on detected objects and their relevance to a road construction survey.
Detected objects: ${result.labels.length > 0 ? result.labels.join(', ') : 'None detected'}
Confidences: ${JSON.stringify(result.confidences)}
Location: Latitude ${result.lat?.toFixed(4) || 'N/A'}, Longitude ${result.lon?.toFixed(4) || 'N/A'}
Chainage: ${result.chainage_km || 'N/A'} KM
GPS Valid: ${result.gps_valid ? 'Yes' : 'No'}
Distance to Route: ${result.distance_to_route !== null ? `${result.distance_to_route} meters` : 'N/A'}

Example of desired output: 'The image taken at KM 10.5 shows a road under construction with a total station and tripod, indicating active surveying work. GPS coordinates are within 50 meters of the planned route.'`;

        try {
            const payload = {
                "model": LLM_MODEL,
                "prompt": prompt
            };

            const response = await fetch(LLM_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`LLM API HTTP error! status: ${response.status}`);
            }

            const resultData = await response.json();

            const generatedText = resultData.text || resultData.generated_text || resultData.response;

            if (generatedText) {
                setImageDescriptions((prev) => ({ ...prev, [result.filename]: generatedText }));
            } else {
                setError("Failed to generate description: Unexpected LLM response structure.");
                console.error("LLM API response:", resultData);
            }
        } catch (err) {
            console.error("Error generating image description:", err);
            setError(`Failed to generate description: ${err.message}. Check LLM API connection.`);
        } finally {
            setGeneratingDescriptionIndex(null);
        }
    };

    // Function to generate an overall summary of all results using the new LLM API
    const generateOverallSummary = async () => {
        setGeneratingSummary(true);
        setError(null);

        if (analysisResults.length === 0) {
            setOverallSummary("No analysis results available to summarize.");
            setGeneratingSummary(false);
            return;
        }

        let summaryPrompt = "Summarize the findings from the following survey image analyses. Provide an overview of the detected objects, GPS validity, and any notable observations across all images. Keep the summary concise and professional, ideally in 2-3 paragraphs.\n\n";
        analysisResults.forEach((result, index) => {
            summaryPrompt += `Image ${index + 1} (${result.filename}):\n`;
            summaryPrompt += `  - Detected: ${result.labels.length > 0 ? result.labels.join(', ') : 'None'}\n`;
            summaryPrompt += `  - GPS: Lat ${result.lat?.toFixed(4) || 'N/A'}, Lon ${result.lon?.toFixed(4) || 'N/A'} (Valid: ${result.gps_valid ? 'Yes' : 'No'})\n`;
            summaryPrompt += `  - Chainage: ${result.chainage_km || 'N/A'} KM\n`;
            if (result.distance_to_route !== null) {
                summaryPrompt += `  - Distance to Route: ${result.distance_to_route} meters\n`;
            }
            summaryPrompt += `\n`; // Add a newline for readability in the prompt
        });

        try {
            const payload = {
                "model": LLM_MODEL,
                "prompt": summaryPrompt
            };

            const response = await fetch(LLM_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`LLM API HTTP error! status: ${response.status}`);
            }

            const resultData = await response.json();

            const generatedText = resultData.text || resultData.generated_text || resultData.response;

            if (generatedText) {
                setOverallSummary(generatedText);
            } else {
                setError("Failed to generate summary: Unexpected LLM response structure.");
                console.error("LLM API response:", resultData);
            }
        } catch (err) {
            console.error("Error generating overall summary:", err);
            setError(`Failed to generate summary: ${err.message}. Check LLM API connection.`);
        } finally {
            setGeneratingSummary(false);
        }
    };

    // Remove a selected image - Wrapped in useCallback
    const removeImage = useCallback((indexToRemove) => {
        setSelectedFiles((prevFiles) => prevFiles.filter((_, index) => index !== indexToRemove));
        setImagePreviews((prevPreviews) => prevPreviews.filter((_, index) => index !== indexToRemove));
        // Also remove its description if it exists
        setImageDescriptions((prevDescriptions) => {
            const newDescriptions = { ...prevDescriptions };
            const filenameToRemove = analysisResults[indexToRemove]?.filename;
            if (filenameToRemove) {
                delete newDescriptions[filenameToRemove];
            }
            return newDescriptions;
        });
        // Clear overall summary if any image is removed
        setOverallSummary('');
    }, [setSelectedFiles, setImagePreviews, setImageDescriptions, analysisResults, setOverallSummary]);


    return (
        <div className="app-container">
            <div className="main-card">
                {/* Header */}
                <div className="header-section">
                    <h1 className="app-title">Survey Image Analysis</h1>
                </div>

                {/* Device Location */}
                <div className="location-alert">
                    <div className="location-content">
                        <i className="fas fa-exclamation-triangle location-icon"></i>
                        <div>
                            <p className="location-title">Device Location</p>
                            <p className="location-text">
                                {locationDenied ? error || "Location access denied by user" : `Lat: ${userLocation.lat?.toFixed(4)}, Lon: ${userLocation.lon?.toFixed(4)}`}
                            </p>
                        </div>
                    </div>
                    <button onClick={getLocation} className="refresh-button">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>

                {/* Server Status Display */}
                <div className={`server-status-display ${serverAccessible ? 'server-status-accessible' : 'server-status-inaccessible'}`}>
                    <i className={`fas ${serverAccessible ? 'fa-check-circle' : 'fa-times-circle'} server-status-icon`}></i>
                    <p className="server-status-text">Backend server: {serverStatusMessage}</p>
                    <button onClick={checkServerStatus} className="refresh-button">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>

                {loading ? (
                    // Loading Overlay (visible when loading)
                    <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p className="loading-message">{loadingMessage}</p>
                        <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${loadingProgress}%` }}></div>
                        </div>
                        <p className="progress-text">{loadingProgress}%</p>
                    </div>
                ) : (
                    // Main Input Section (visible when not loading AND no analysis results yet)
                    analysisResults.length === 0 && (
                        <>
                            {/* Manual Chainage */}
                            <div className="manual-chainage-section">
                                <p className="chainage-title">
                                    <i className="fas fa-map-marker-alt icon-margin"></i>Manual Chainage (KM)
                                </p>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={chainage}
                                    onChange={(e) => setChainage(e.target.value)}
                                    className="chainage-input"
                                />
                                <p className="chainage-description">
                                    Enter the chainage position in kilometers for route analysis
                                </p>
                            </div>

                            {/* Image Capture/Upload Buttons */}
                            <div className="image-buttons-grid">
                                <button
                                    onClick={handleTakePhotoClick}
                                    className="image-button"
                                >
                                    <i className="fas fa-camera image-button-icon"></i>
                                    <span className="image-button-text">Take Photo</span>
                                </button>
                                <button
                                    onClick={handleUploadImagesClick}
                                    className="image-button"
                                >
                                    <i className="fas fa-cloud-upload-alt image-button-icon"></i>
                                    <span className="image-button-text">Upload Images</span>
                                </button>
                            </div>

                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                multiple
                                accept="image/*"
                                className="hidden-file-input"
                            />

                            {/* Drag and Drop Area */}
                            <div
                                className="drag-drop-area"
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <i className="fas fa-cloud-upload-alt drag-drop-icon"></i>
                                <p className="drag-drop-text">Drag and drop images here</p>
                                <p className="drag-drop-subtext">or tap to select files</p>
                            </div>

                            {/* Selected Image Previews */}
                            {imagePreviews.length > 0 && (
                                <div className="image-previews-grid">
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} className="image-preview-item">
                                            <img src={URL.createObjectURL(file)} alt={`Preview ${index}`} className="image-preview-img" />
                                            <button
                                                onClick={() => removeImage(index)}
                                                className="remove-image-button"
                                            >
                                                <i className="fas fa-times-circle"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Run Analysis Button */}
                            <button
                                onClick={handleRunAnalysis}
                                disabled={loading || selectedFiles.length === 0 || !serverAccessible}
                                className={`run-analysis-button ${loading || selectedFiles.length === 0 || !serverAccessible ? 'disabled' : ''}`}
                            >
                                {loading ? (
                                    <i className="fas fa-spinner fa-spin icon-margin"></i>
                                ) : (
                                    <i className="fas fa-chart-bar icon-margin"></i>
                                )}
                                Run Analysis ({selectedFiles.length})
                            </button>
                            <p className="analysis-hint">
                                Take photos or select images to analyze
                            </p>
                        </>
                    )
                )}

                {/* Error Display */}
                {error && (
                    <div className="error-message" role="alert">
                        <strong>Error!</strong>
                        <span className="error-text">{error}</span>
                    </div>
                )}

                {/* Analysis Results Display */}
                {analysisResults.length > 0 && (
                    <div className="analysis-results-container">
                        <h2 className="analysis-results-title">Analysis Results</h2>
                        {analysisResults.map((result, index) => (
                            <div
                                key={index}
                                className="analysis-result-item"
                                onClick={() => setExpandedResultIndex(expandedResultIndex === index ? null : index)} // Toggle expand
                            >
                                {/* Display the image */}
                                {result.filename && (
                                    <div className="result-image-container">
                                        <img
                                            src={`${BACKEND_URL}/uploads/${result.filename}`}
                                            alt={`Analyzed Image ${result.filename}`}
                                            className="result-image"
                                            onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/150x100/cccccc/333333?text=Image+Not+Found`; }}
                                        />
                                    </div>
                                )}
                                <p className="result-label">Image: <span className="result-value">{result.filename}</span></p>
                                <p className="result-label">Chainage: <span className="result-value">{result.chainage_km || 'N/A'}</span></p>
                                <p className="result-label">GPS: <span className="result-value">Lat: {result.lat?.toFixed(4) || 'N/A'}, Lon: {result.lon?.toFixed(4) || 'N/A'}</span></p>
                                <p className="result-label">GPS Valid: <span className={`result-value ${result.gps_valid ? 'gps-valid' : 'gps-invalid'}`}>{result.gps_valid ? 'Yes' : 'No'}</span></p>
                                {result.distance_to_route !== null && (
                                    <p className="result-label">Distance to Route: <span className="result-value">{result.distance_to_route} meters</span></p>
                                )}
                                <div className="detected-labels-section">
                                    <p className="detected-labels-title">Detected Labels:</p>
                                    {result.labels.length > 0 ? (
                                        <ul className="detected-labels-list">
                                            {result.labels.map((label, i) => (
                                                <li key={i}>{label}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="no-labels-text">No objects detected above threshold.</p>
                                    )}
                                </div>

                                {/* Conditionally display confidence scores */}
                                {expandedResultIndex === index && (
                                    <div className="confidence-scores-section">
                                        <p className="confidence-scores-title">Confidence Scores:</p>
                                        <ul className="confidence-scores-list">
                                            {Object.entries(result.confidences).map(([label, score]) => (
                                                <li key={label}>
                                                    <span>{label}: {(score * 100).toFixed(2)}%</span>
                                                    <div className="confidence-bar-container">
                                                        <div className="confidence-bar-fill" style={{ width: `${(score * 100).toFixed(2)}%` }}></div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Generate Image Description Button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); generateImageDescription(result, index); }} // Stop propagation to prevent collapsing
                                    disabled={generatingDescriptionIndex === index}
                                    className={`generate-description-button ${generatingDescriptionIndex === index ? 'disabled' : ''}`}
                                >
                                    {generatingDescriptionIndex === index ? (
                                        <i className="fas fa-spinner fa-spin icon-margin"></i>
                                    ) : (
                                        <i className="fas fa-magic icon-margin"></i>
                                    )}
                                    Generate Description
                                </button>
                                {imageDescriptions[result.filename] && (
                                    <div className="image-description-output">
                                        <p className="description-title">Description:</p>
                                        <p>{imageDescriptions[result.filename]}</p>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Summarize All Results Button */}
                        {analysisResults.length > 0 && (
                            <>
                                <button
                                    onClick={generateOverallSummary}
                                    disabled={generatingSummary}
                                    className={`summarize-all-button ${generatingSummary ? 'disabled' : ''}`}
                                >
                                    {generatingSummary ? (
                                        <i className="fas fa-spinner fa-spin icon-margin"></i>
                                    ) : (
                                        <i className="fas fa-file-alt icon-margin"></i>
                                    )}
                                    Summarize All Results
                                </button>
                                {overallSummary && (
                                    <div className="overall-summary-output">
                                        <h3 className="overall-summary-title">Overall Summary:</h3>
                                        <p className="overall-summary-text">{overallSummary}</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Upload Again Button */}
                        <button
                            onClick={handleUploadAgain}
                            className="upload-again-button"
                        >
                            <i className="fas fa-redo icon-margin"></i> Upload Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
