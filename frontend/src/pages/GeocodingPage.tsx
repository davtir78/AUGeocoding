import { useState } from 'react';
import { Box, Paper, Grid, Typography } from '@mui/material';
import SearchBox from '../components/SearchBox';
import ResultList from '../components/ResultList';
import GeocodeMap from '../components/GeocodeMap';
import ResultDetail from '../components/ResultDetail';

const GeocodingPage = () => {
    const [results, setResults] = useState([]);
    const [selectedResult, setSelectedResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = (newResults: any) => {
        setResults(newResults);
        setSelectedResult(null);
    };

    return (
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', bgcolor: 'background.default' }}>
            {/* Sidebar - Search & Results */}
            <Box sx={{
                width: 480,
                flexShrink: 0,
                borderRight: 1,
                borderColor: 'primary.main',
                bgcolor: 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 2,
                boxShadow: (theme) => `4px 0 20px -10px ${theme.palette.primary.main}40`,
                className: 'bg-texture'
            }}>
                <Box sx={{ p: 3, borderBottom: 1, borderColor: 'primary.main', opacity: 0.9 }}>
                    <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <span className="material-icons" style={{ fontSize: 16 }}>search</span>
                        Address Inquiry
                    </Typography>
                    <SearchBox onSearch={handleSearch} setLoading={setLoading} loading={loading} />
                </Box>
                <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <ResultList
                        results={results}
                        onSelect={setSelectedResult}
                        selectedId={selectedResult?.id}
                    />
                </Box>
            </Box>

            {/* Main Content - Vertical Split Layout */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Top Half: Result Detail Panel */}
                <Box sx={{
                    height: selectedResult ? '50%' : '0%',
                    minHeight: selectedResult ? '400px' : '0',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    overflow: 'hidden',
                    borderBottom: selectedResult ? 1 : 0,
                    borderColor: 'primary.main',
                    bgcolor: 'background.paper',
                    position: 'relative',
                    zIndex: 1,
                    className: 'bg-texture paper-grain'
                }}>
                    {selectedResult && (
                        <Box sx={{ p: 0, height: '100%', overflow: 'auto' }}>
                            <ResultDetail result={selectedResult} />
                        </Box>
                    )}
                </Box>

                {/* Bottom Half: Map */}
                <Box sx={{ flexGrow: 1, position: 'relative' }}>
                    <GeocodeMap selectedResult={selectedResult} results={results} />

                    {/* Floating Info */}
                    {!selectedResult && results.length > 0 && (
                        <Box sx={{
                            position: 'absolute',
                            bottom: 24,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            bgcolor: 'rgba(255,255,255,0.95)',
                            px: 3, py: 1.5, borderRadius: 2,
                            border: 1,
                            borderColor: 'primary.main',
                            boxShadow: 3,
                            backdropFilter: 'blur(8px)',
                            pointerEvents: 'none',
                            color: 'primary.main'
                        }}>
                            <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                Select a result to investigate
                            </Typography>
                        </Box>
                    )}

                    {/* Map Texture Overlay (Optional) */}
                    <Box sx={{ pointerEvents: 'none', position: 'absolute', inset: 0, boxShadow: 'inset 0 0 40px rgba(0,0,0,0.1)' }} />
                </Box>
            </Box>
        </Box>
    );
};

export default GeocodingPage;
