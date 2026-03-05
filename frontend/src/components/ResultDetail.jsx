import { Box, Grid, Typography, LinearProgress, Paper, Chip, Divider } from '@mui/material';

const ResultDetail = ({ result }) => {
    if (!result) return null;

    const scoreData = [
        { label: 'Overall', value: (result.score || 0) * 100 },
        { label: 'Trigram', value: (result.trigram_score || 0) * 100 },
        { label: 'Token', value: (result.token_score || 0) * 100 },
    ];

    // Helper to safely access tokens
    const t = result.tokens || {};

    // Strip lot/unit qualifiers from the displayed title
    const getDisplayAddress = () => {
        const raw = result.match || '';
        return raw.replace(/^Lot\s+\S+\s+/i, '');
    };

    const displayAddress = getDisplayAddress();

    // Key address components to display prominently
    const addressComponents = [
        { label: 'Unit', value: t.flat ? `Unit ${t.flat}` : '-' },
        { label: 'Level', value: t.level ? `Lvl ${t.level}` : '-' },
        { label: 'Number', value: t.number || '-' },
        { label: 'Street', value: t.street_name || '-' },
        { label: 'Type', value: t.street_type ? (t.street_suffix ? `${t.street_type} ${t.street_suffix}` : t.street_type) : '-' },
        { label: 'Suburb', value: t.locality_name || t.locality || '-' },
        { label: 'State', value: t.state || '-' },
        { label: 'Postcode', value: t.postcode || '-' },
    ];

    const getScoreColor = (v) => v > 80 ? 'success.main' : v > 50 ? 'warning.main' : 'error.main';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', pt: 2, px: 3, pb: 1 }}>
            {/* Header Row: Address + Score Chips */}
            <Box sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="text.secondary" fontWeight="bold" sx={{ lineHeight: 1 }}>Selected Address</Typography>
                <Typography variant="h5" color="text.primary" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mt: 0.5, mb: 1 }}>
                    {displayAddress}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                        label={`GNAF ID: ${result.id}`}
                        size="small"
                        color="primary"
                        sx={{ fontWeight: 'bold', fontSize: '0.75rem', height: '24px', fontFamily: 'monospace' }}
                    />
                    <Chip
                        label="Verified G-NAF Record"
                        size="small"
                        variant="outlined"
                        color="success"
                        sx={{ fontWeight: 600, height: '24px', bgcolor: 'rgba(46, 125, 50, 0.05)' }}
                    />
                    <Box sx={{ mx: 0.5, height: '16px', borderLeft: '1px solid #ccc' }} />
                    {/* Inline Match Scores */}
                    {scoreData.map((s) => (
                        <Chip
                            key={s.label}
                            label={`${s.label}: ${s.value.toFixed(0)}%`}
                            size="small"
                            sx={{
                                height: '22px',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                bgcolor: s.value > 80 ? 'rgba(46, 125, 50, 0.1)' : s.value > 50 ? 'rgba(237, 108, 2, 0.1)' : 'rgba(211, 47, 47, 0.1)',
                                color: s.value > 80 ? 'success.dark' : s.value > 50 ? 'warning.dark' : 'error.dark',
                                border: '1px solid',
                                borderColor: s.value > 80 ? 'rgba(46, 125, 50, 0.3)' : s.value > 50 ? 'rgba(237, 108, 2, 0.3)' : 'rgba(211, 47, 47, 0.3)',
                            }}
                        />
                    ))}
                </Box>
            </Box>

            {/* Two-column layout: Location Identity | Spatial Context */}
            <Box sx={{ display: 'flex', gap: 2 }}>

                {/* LEFT: Location Identity */}
                <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Location Identity
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden', borderRadius: 2, borderColor: '#e0e0e0' }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', '& > div': { borderRight: '1px solid #eee', borderBottom: '1px solid #eee' } }}>
                            {addressComponents.map((comp) => (
                                <Box key={comp.label} sx={{ flex: '1 1 45%', p: 1, bgcolor: '#fff' }}>
                                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 0.25, fontWeight: 600, fontSize: '0.6rem' }}>
                                        {comp.label}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="600" color="text.primary">
                                        {comp.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                </Box>

                {/* RIGHT: Spatial Context (Coordinates + LGA + MMM + Mesh Block) */}
                <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                        Spatial Context
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: '#e0e0e0', bgcolor: '#fbfbfb', overflow: 'hidden' }}>
                        {/* Coordinates */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                            <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight="700" sx={{ fontSize: '0.6rem' }}>LATITUDE</Typography>
                                <Typography variant="body2" fontFamily="monospace" fontWeight="600" sx={{ color: 'primary.dark' }}>
                                    {result.coordinates?.latitude?.toFixed(6) || '-'}
                                </Typography>
                            </Box>
                            <Box>
                                <Typography variant="caption" color="text.secondary" fontWeight="700" sx={{ fontSize: '0.6rem' }}>LONGITUDE</Typography>
                                <Typography variant="body2" fontFamily="monospace" fontWeight="600" sx={{ color: 'primary.dark' }}>
                                    {result.coordinates?.longitude?.toFixed(6) || '-'}
                                </Typography>
                            </Box>
                        </Box>

                        <Divider sx={{ my: 1, opacity: 0.6 }} />

                        {/* LGA */}
                        <Typography variant="caption" display="block" color="text.secondary" fontWeight="700" sx={{ mb: 0.5, fontSize: '0.6rem' }}>
                            LOCAL GOVERNMENT AREA (LGA)
                        </Typography>
                        {result.lga && result.lga.length > 0 ? (
                            result.lga.map((lga, idx) => (
                                <Box key={idx} sx={{ mb: 0.5 }}>
                                    <Typography variant="body2" fontWeight="700">{lga.lga_name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{lga.lga_code} ({lga.state})</Typography>
                                </Box>
                            ))
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 0.5 }}>No LGA data</Typography>
                        )}

                        <Divider sx={{ my: 1, opacity: 0.6 }} />

                        {/* MMM */}
                        <Typography variant="caption" display="block" color="text.secondary" fontWeight="700" sx={{ mb: 0.5, fontSize: '0.6rem' }}>
                            MMM REMOTE AREA
                        </Typography>
                        {result.mmm_regions && result.mmm_regions.length > 0 ? (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                                {result.mmm_regions.map((reg, idx) => (
                                    <Chip key={idx} label={`MMM ${reg.mmm_code} (${reg.year})`} color="secondary" size="small" variant="filled" sx={{ fontWeight: 600, fontSize: '0.65rem' }} />
                                ))}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 0.5 }}>Not classified</Typography>
                        )}

                        {/* Mesh Block */}
                        {result.mesh_block && result.mesh_block.length > 0 && (
                            <>
                                <Divider sx={{ my: 1, opacity: 0.6 }} />
                                <Typography variant="caption" display="block" color="text.secondary" fontWeight="700" sx={{ mb: 0.5, fontSize: '0.6rem' }}>
                                    ABS MESH BLOCK
                                </Typography>
                                {result.mesh_block.map((mb, idx) => (
                                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Chip label={mb.mb_code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }} />
                                        <Typography variant="body2">{mb.category}</Typography>
                                    </Box>
                                ))}
                            </>
                        )}
                    </Paper>
                </Box>
            </Box>
        </Box>
    );
};

export default ResultDetail;
