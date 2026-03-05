import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import config from '../../amplifyconfiguration.json';

const HTTP_API_BASE_URL = import.meta.env.VITE_HTTP_API_BASE_URL ||
    config.API?.REST?.GeocodingAPI?.endpoint ||
    'https://{api-id}.execute-api.{region}.amazonaws.com';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';

interface FileDropzoneProps {
    onJobCreated: (jobId: string) => void;
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onJobCreated }) => {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleUpload(files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUpload(e.target.files[0]);
        }
    };

    const handleUpload = async (file: File) => {
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            setError('Please upload a valid CSV file.');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            // Get the Cognito JWT token for Authorization header
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // 1. Create Job & Get Presigned URL
            const url = `${HTTP_API_BASE_URL}/jobs`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errText}`);
            }

            const data: any = await response.json();

            const { job_id, upload_url } = data;

            // 2. Upload File directly to S3
            // Use axios to avoid Amplify's signing which breaks presigned URLs
            await axios.put(upload_url, file, {
                headers: {
                    'Content-Type': 'text/csv'
                }
            });

            // 3. Notify Parent
            onJobCreated(job_id);

        } catch (err: any) {
            console.error('Upload failed:', err);
            setError(err.message || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <Paper
            variant="outlined"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                p: 5,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: dragging ? 'rgba(201, 168, 76, 0.1)' : '#fcfcfc',
                borderColor: dragging ? 'primary.main' : '#e0e0e0',
                borderStyle: 'dashed',
                borderWidth: 2,
                transition: 'all 0.2s ease',
                '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'rgba(201, 168, 76, 0.05)'
                }
            }}
        >
            <input
                accept=".csv"
                style={{ display: 'none' }}
                id="raised-button-file"
                type="file"
                onChange={handleFileSelect}
            />
            <label htmlFor="raised-button-file">
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    {uploading ? (
                        <CircularProgress size={48} />
                    ) : (
                        <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                    )}

                    <Box>
                        <Typography variant="h6" gutterBottom>
                            {uploading ? 'Uploading...' : 'Drag & Drop CSV here'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            or click to select file
                        </Typography>
                    </Box>

                    {error && (
                        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                            {error}
                        </Typography>
                    )}
                </Box>
            </label>
        </Paper>
    );
};

export default FileDropzone;
