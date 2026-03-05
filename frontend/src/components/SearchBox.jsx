import { useState } from 'react';
import { TextField, Button, Box, CircularProgress, Snackbar, Alert } from '@mui/material';
import { post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';

const SearchBox = ({ onSearch, setLoading, loading }) => {
    const [address, setAddress] = useState('');
    const [error, setError] = useState(null);

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!address) return;

        console.log('Amplify Config:', Amplify.getConfig()); // Debug Config

        setLoading(true);
        setError(null);
        try {
            // Get the Cognito JWT token for Authorization header
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            const restOperation = post({
                apiName: 'GeocodingAPI',
                path: '/geocode',
                options: {
                    body: { address },
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            });
            const response = await restOperation.response;
            const data = await response.body.json();

            // Map Backend Schema (gnaf_pid, address, confidence) to Frontend Schema (id, match, score)
            const mappedResults = (data.results || []).map(item => ({
                id: item.gnaf_pid,
                match: item.address,
                primary_address: item.primary_address_string,
                is_base: item.is_base,
                primary_secondary: item.primary_secondary,
                score: (item.confidence || 0) / 100, // Convert 0-100 to 0.0-1.0
                trigram_score: item.trigram_score || 0,
                token_score: item.token_score || 0,
                type: 'ADDRESS',
                coordinates: item.coordinates,
                tokens: item.tokens,
                mmm_regions: item.mmm_regions,
                lga: item.lga,
                mesh_block: item.mesh_block
            }));

            onSearch(mappedResults);
        } catch (error) {
            console.error('Search failed:', error);
            setError(error.message || 'Search failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    label="Enter Address"
                    variant="outlined"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={loading}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') handleSearch();
                    }}
                />
                <Button
                    variant="contained"
                    type="submit"
                    disabled={loading || !address}
                    sx={{ minWidth: '100px' }}
                >
                    {loading ? <CircularProgress size={24} /> : 'Search'}
                </Button>
            </Box>

            <Snackbar
                open={!!error}
                autoHideDuration={6000}
                onClose={() => setError(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
                    {error}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default SearchBox;
