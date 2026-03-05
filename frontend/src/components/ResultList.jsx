import { List, ListItemButton, ListItemText, Typography, Divider, Box, Chip } from '@mui/material';

const ResultList = ({ results, onSelect, selectedId }) => {
    if (results.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', mt: 4 }}>
                <Typography color="textSecondary">No results to display. Start by searching above.</Typography>
            </Box>
        );
    }

    const getScoreColor = (score) => {
        if (score >= 0.8) return 'success';
        if (score >= 0.5) return 'warning';
        return 'error';
    };

    const getScoreLabel = (score) => {
        if (score >= 0.8) return 'High Confidence';
        if (score >= 0.5) return 'Medium Confidence';
        return 'Low Confidence';
    };

    return (
        <List sx={{ width: '100%', bgcolor: 'background.paper', p: 0 }}>
            {results.map((result, index) => (
                <div key={result.id || index}>
                    <ListItemButton
                        selected={selectedId === result.id}
                        onClick={() => onSelect(result)}
                        sx={{
                            '&.Mui-selected': {
                                backgroundColor: 'primary.main',
                                color: 'primary.contrastText',
                                '&:hover': {
                                    backgroundColor: 'primary.dark',
                                },
                                '& .MuiListItemText-secondary': {
                                    color: 'rgba(255, 255, 255, 0.9)',
                                },
                                '& .MuiChip-root': {
                                    borderColor: 'rgba(255,255,255,0.5)',
                                    color: 'white',
                                }
                            }
                        }}
                    >
                        <ListItemText
                            primary={(result.match || '').replace(/^Lot\s+\S+\s+/i, '')}
                            secondaryTypographyProps={{ component: 'div' }}
                            secondary={
                                <Box sx={{ display: 'flex', flexDirection: 'column', mt: 0.5, gap: 0.5 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>
                                            SCORE: {(result.score * 100).toFixed(1)}%
                                        </Typography>
                                        <Chip
                                            label={result.type}
                                            size="small"
                                            variant="outlined"
                                            color={result.type === 'ADDRESS' ? 'primary' : 'secondary'}
                                            sx={{ height: '18px', fontSize: '9px' }}
                                        />
                                    </Box>
                                    <Chip
                                        label={getScoreLabel(result.score)}
                                        size="small"
                                        color={getScoreColor(result.score)}
                                        sx={{ height: '20px', fontSize: '10px', width: 'fit-content' }}
                                    />
                                </Box>
                            }
                        />
                    </ListItemButton>
                    <Divider component="li" />
                </div>
            ))}
        </List>
    );
};

export default ResultList;
