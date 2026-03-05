import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Tabs,
    Tab,
    Alert,
    CircularProgress,
    useTheme,
} from '@mui/material';
import ApiIcon from '@mui/icons-material/Api';
import DescriptionIcon from '@mui/icons-material/Description';
import InfoIcon from '@mui/icons-material/Info';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import * as yaml from 'js-yaml';

import ApiEndpointCard, { type ApiEndpointCardProps } from '../components/ApiEndpointCard';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`api-tabpanel-${index}`}
            aria-labelledby={`api-tab-${index}`}
            {...other}
            style={{ height: value === index ? '100%' : '0px', width: '100%' }}
        >
            {value === index && (
                <Box sx={{ height: '100%', minHeight: '600px', width: '100%' }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const APIsPage: React.FC = () => {
    const [spec, setSpec] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const theme = useTheme();

    useEffect(() => {
        fetch('/openapi.yaml')
            .then((response) => response.text())
            .then((text) => {
                try {
                    const parsedSpec = yaml.load(text);
                    setSpec(parsedSpec);
                    setLoading(false);
                } catch (e) {
                    setError('Failed to parse OpenAPI specification');
                    setLoading(false);
                }
            })
            .catch((err) => {
                setError('Failed to load OpenAPI specification');
                setLoading(false);
            });
    }, []);

    const getEndpointsFromSpec = (): ApiEndpointCardProps[] => {
        if (!spec || !spec.paths) return [];

        const endpoints: ApiEndpointCardProps[] = [];

        Object.entries(spec.paths).forEach(([path, methods]: [string, any]) => {
            Object.entries(methods).forEach(([method, details]: [string, any]) => {
                endpoints.push({
                    method: method.toUpperCase() as any,
                    path,
                    description: details.summary || details.description || 'No description available',
                    category: details.tags ? details.tags[0] : 'General',
                });
            });
        });

        return endpoints;
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error">{error}</Alert>
            </Container>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default', width: '100%' }}>
            <Box sx={{ px: 4, py: 4, maxWidth: '100%', width: '100%' }}>
                {/* Header */}
                <Box display="flex" alignItems="center" mb={4}>
                    <ApiIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: 'primary.main' }}>
                            API Documentation
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Comprehensive reference for the AWS Geocoding API
                        </Typography>
                    </Box>
                </Box>

                {/* Main Content */}
                <Paper sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    minHeight: '70vh'
                }}>
                    <Box className="scalar-light-override" sx={{
                        height: '100%',
                        minHeight: '700px',
                        width: '100%',
                    }}>
                        <ApiReferenceReact
                            configuration={{
                                spec: {
                                    content: spec,
                                } as any,
                                darkMode: false,
                                theme: 'none',
                                layout: 'modern',
                                hideModels: true,
                                forceShowOperations: true,
                                showSidebar: true,
                                agent: {
                                    disabled: true,
                                },
                                customCss: `
                                  .agent-button-container { display: none !important; }
                                  .ask-agent-scalar-input { display: none !important; }
                                  button.ask-agent-scalar-send { display: none !important; }
                                  .sidebar-search-button { padding-right: 12px !important; }
                                `
                            } as any}
                        />
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
};

export default APIsPage;
