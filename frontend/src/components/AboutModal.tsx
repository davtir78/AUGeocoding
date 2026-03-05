import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    IconButton,
    Divider,
    Grid,
    Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PublicIcon from '@mui/icons-material/Public';
import MapIcon from '@mui/icons-material/Map';
import StorageIcon from '@mui/icons-material/Storage';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

interface AboutModalProps {
    open: boolean;
    onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ open, onClose }) => {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    bgcolor: '#fdfbf7', // Parchment
                    backgroundImage: 'linear-gradient(rgba(200, 167, 76, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(200, 167, 76, 0.05) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }
            }}
        >
            <DialogTitle sx={{ m: 0, p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h5" component="span" sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 800, color: 'primary.dark' }}>
                    About the Australian Geocoding Platform
                </Typography>
                <IconButton onClick={onClose} sx={{ color: 'grey.500' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 4 }}>
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700 }}>
                        Precision Geocoding for Australia
                    </Typography>
                    <Typography variant="body1" color="text.secondary" paragraph>
                        This platform serves as a unified engine for G-NAF, LGA, and Mesh Block resolution.
                        It is designed for speed, governance, and structural address integrity at a national scale.
                    </Typography>
                </Box>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    {[
                        { title: 'Addresses', value: '16.7M+', sub: 'G-NAF Validated', icon: <MapIcon /> },
                        { title: 'Local Gov', value: '548 Regions', sub: 'Council Boundaries', icon: <PublicIcon /> },
                        { title: 'Mesh Blocks', value: '360k+ Units', sub: 'ABS Micro-Regions', icon: <StorageIcon /> },
                        { title: 'Remoteness', value: 'MMM Scale', sub: '1 to 7 Ranking', icon: <PlayArrowIcon /> }
                    ].map((card, idx) => (
                        <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
                            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.5)', borderColor: 'rgba(200, 167, 76, 0.2)' }}>
                                <Box sx={{ color: 'primary.main', mb: 1 }}>{card.icon}</Box>
                                <Typography variant="h6" fontWeight={800} sx={{ fontFamily: '"Playfair Display", serif' }}>{card.value}</Typography>
                                <Typography variant="caption" display="block" color="text.secondary">{card.title}</Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Box>
                    <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1, fontFamily: '"Playfair Display", serif' }}>
                        Automated Data Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        Our system automatically discovers and installs the latest address updates from official government sources.
                        By managing the entire data lifecycle in the background, we ensure your searches are always based on the
                        most current national information without any manual effort.
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 3 }}>
                <Button
                    onClick={onClose}
                    variant="contained"
                    sx={{
                        bgcolor: 'primary.main',
                        fontWeight: 700,
                        '&:hover': { bgcolor: 'primary.dark' }
                    }}
                >
                    Got it
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AboutModal;
