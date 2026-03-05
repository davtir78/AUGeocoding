import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    useTheme,
    alpha
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export interface ApiEndpointCardProps {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    description: string;
    category?: string;
    baseUrl?: string;
}

const ApiEndpointCard: React.FC<ApiEndpointCardProps> = ({
    method,
    path,
    description,
    category,
    baseUrl = 'https://api.geocoding.example.com'
}) => {
    const theme = useTheme();

    const getMethodColor = () => {
        switch (method) {
            case 'GET':
                return {
                    bgcolor: alpha(theme.palette.success.main, 0.15),
                    color: 'success.dark',
                    borderColor: alpha(theme.palette.success.main, 0.3)
                };
            case 'POST':
                return {
                    bgcolor: alpha(theme.palette.info.main, 0.15),
                    color: 'info.dark',
                    borderColor: alpha(theme.palette.info.main, 0.3)
                };
            case 'PUT':
                return {
                    bgcolor: alpha(theme.palette.warning.main, 0.15),
                    color: 'warning.dark',
                    borderColor: alpha(theme.palette.warning.main, 0.3)
                };
            case 'DELETE':
                return {
                    bgcolor: alpha(theme.palette.error.main, 0.15),
                    color: 'error.dark',
                    borderColor: alpha(theme.palette.error.main, 0.3)
                };
            case 'PATCH':
                return {
                    bgcolor: alpha(theme.palette.secondary.main, 0.15),
                    color: 'secondary.dark',
                    borderColor: alpha(theme.palette.secondary.main, 0.3)
                };
            default:
                return {
                    bgcolor: alpha(theme.palette.grey[500], 0.15),
                    color: 'grey.700',
                    borderColor: alpha(theme.palette.grey[500], 0.3)
                };
        }
    };

    const methodColors = getMethodColor();
    const fullUrl = `${baseUrl}${path}`;

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(fullUrl);
    };

    return (
        <Card
            elevation={0}
            sx={{
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'all 0.2s ease',
                '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.15)}`
                }
            }}
        >
            <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1.5 }}>
                    <Chip
                        label={method}
                        size="small"
                        sx={{
                            minWidth: 60,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            py: 0.5,
                            ...methodColors
                        }}
                    />
                    {category && (
                        <Chip
                            label={category}
                            size="small"
                            variant="outlined"
                            sx={{
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: 22,
                                borderColor: '#d0c9b5',
                                color: 'text.primary'
                            }}
                        />
                    )}
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Copy URL">
                            <IconButton
                                size="small"
                                onClick={handleCopyUrl}
                                sx={{
                                    color: 'text.secondary',
                                    '&:hover': {
                                        color: theme.palette.primary.main,
                                        bgcolor: alpha(theme.palette.primary.main, 0.1)
                                    }
                                }}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in new tab">
                            <IconButton
                                size="small"
                                href={fullUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    color: 'text.secondary',
                                    '&:hover': {
                                        color: theme.palette.primary.main,
                                        bgcolor: alpha(theme.palette.primary.main, 0.1)
                                    }
                                }}
                            >
                                <OpenInNewIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                        fontFamily: 'monospace',
                        color: 'text.primary',
                        mb: 1,
                        wordBreak: 'break-all'
                    }}
                >
                    {path}
                </Typography>

                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                    {description}
                </Typography>
            </CardContent>
        </Card>
    );
};

export default ApiEndpointCard;
