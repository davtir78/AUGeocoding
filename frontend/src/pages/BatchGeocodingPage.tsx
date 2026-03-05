import React, { useState } from 'react';
import { Box, Typography, Container, Alert } from '@mui/material';
import FileDropzone from '../components/Batch/FileDropzone';
import JobStatusList from '../components/Batch/JobStatusList';

import BatchPredictionIcon from '@mui/icons-material/BatchPrediction';

const BatchGeocodingPage = () => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [lastJobId, setLastJobId] = useState<string | null>(null);

    const handleJobCreated = (jobId: string) => {
        // 1. Save to local storage
        const currentJobs = JSON.parse(localStorage.getItem('aws-geo-batch-jobs') || '[]');
        const newJob = {
            jobId,
            createdAt: new Date().toISOString(),
            status: 'PROCESSING'
        };
        localStorage.setItem('aws-geo-batch-jobs', JSON.stringify([...currentJobs, newJob]));

        // 2. Trigger list refresh
        setLastJobId(jobId);
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <Container maxWidth="lg" sx={{ py: 6 }}>
            <Box sx={{ mb: 6, textAlign: 'center' }}>
                <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 2,
                    mb: 3,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'white',
                    boxShadow: 3
                }}>
                    <BatchPredictionIcon sx={{ fontSize: 32 }} />
                </Box>
                <Typography variant="h3" component="h1" gutterBottom sx={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: 'text.primary' }}>
                    Batch Geocoding
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', fontStyle: 'italic', mb: 2 }}>
                    Upload your manifest of locations for bulk processing.
                </Typography>
                <Alert severity="info" sx={{ maxWidth: 600, mx: 'auto', textAlign: 'left' }}>
                    <strong>Format required:</strong> A valid CSV file. The geocoder will look for a column named <code>address</code>. If not found, it defaults to using the very first column.
                </Alert>
            </Box>

            {lastJobId && (
                <Alert severity="success" sx={{ mb: 4 }} onClose={() => setLastJobId(null)}>
                    Job started successfully! ID: {lastJobId}
                </Alert>
            )}

            <FileDropzone onJobCreated={handleJobCreated} />

            <JobStatusList refreshTrigger={refreshTrigger} />
        </Container>
    );
};

export default BatchGeocodingPage;
