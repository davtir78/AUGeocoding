import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import maplibregl from 'maplibre-gl';
import { fetchAuthSession } from 'aws-amplify/auth';
import { createRequestTransformer } from 'amazon-location-helpers';
import 'maplibre-gl/dist/maplibre-gl.css';

const GeocodeMap = ({ selectedResult, results }) => {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef([]);

    // Note: Amazon Location Service usually requires SigV4 signing or an API Key.
    // Since Cognito/API Key is not yet configured, we provide a placeholder UX 
    // until the security stack is finalized.

    useEffect(() => {
        if (map.current) return;

        const initializeMap = async () => {
            try {
                const session = await fetchAuthSession();
                const credentials = session.credentials;

                if (!credentials) {
                    console.error("No AWS credentials found");
                    return;
                }

                const requestTransformer = await createRequestTransformer({
                    credentials,
                    region: 'ap-southeast-2'
                });

                map.current = new maplibregl.Map({
                    container: mapContainer.current,
                    style: `https://maps.geo.ap-southeast-2.amazonaws.com/maps/v0/maps/aws-geocoding-map/style-descriptor`,
                    center: [133.7751, -25.2744],
                    zoom: 3,
                    transformRequest: requestTransformer
                });

                map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
            } catch (error) {
                console.error("Error initializing map:", error);
            }
        };

        initializeMap();
    }, []);

    useEffect(() => {
        if (!map.current) return;

        // Clear existing markers
        markers.current.forEach(m => m.remove());
        markers.current = [];

        // Add markers for all results (if they have coordinates)
        results.forEach(res => {
            if (res.coordinates?.longitude && res.coordinates?.latitude) {
                const popup = new maplibregl.Popup({ offset: 25 })
                    .setText(`${res.match} (Score: ${res.score})`);

                const marker = new maplibregl.Marker({
                    color: res.id === selectedResult?.id ? '#ff9900' : '#232f3e'
                })
                    .setLngLat([res.coordinates.longitude, res.coordinates.latitude])
                    .setPopup(popup)
                    .addTo(map.current);

                markers.current.push(marker);
            }
        });

        if (selectedResult?.coordinates?.longitude && selectedResult?.coordinates?.latitude) {
            map.current.flyTo({
                center: [selectedResult.coordinates.longitude, selectedResult.coordinates.latitude],
                zoom: 15,
                essential: true,
                padding: { top: 150, bottom: 30, left: 50, right: 50 }
            });
        }
    }, [results, selectedResult]);

    return (
        <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#e0e0e0' }}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

        </Box>
    );
};

export default GeocodeMap;
