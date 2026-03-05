import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Layout from './components/Layout';
import CustomAuthenticator from './components/CustomAuthenticator';
import GeocodingPage from './pages/GeocodingPage';
import BatchGeocodingPage from './pages/BatchGeocodingPage';
import DataRefreshPage from './pages/DataRefreshPage';
import APIsPage from './pages/APIsPage';
import { Typography, Container, Box, Paper, Divider, Button, Chip } from '@mui/material';

import StorageIcon from '@mui/icons-material/Storage';
import MapIcon from '@mui/icons-material/Map';
import PublicIcon from '@mui/icons-material/Public';
import SchoolIcon from '@mui/icons-material/School';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import { Authenticator } from '@aws-amplify/ui-react';

const HomePage = () => {
  return (
    <Box sx={{ pb: 8, bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* 1. Hero Section */}
      <Box
        sx={{
          position: 'relative',
          bgcolor: '#2c2c2c', // Fallback dark color
          pt: { xs: 8, md: 12 },
          pb: { xs: 10, md: 16 },
          px: 3,
          mb: 6,
          borderBottom: '1px solid',
          borderColor: 'primary.main', // Gold border at bottom
          // Consolidated background property to prevent tiling and ensure cover
          background: 'linear-gradient(180deg, rgba(30, 30, 30, 0.85) 0%, rgba(30, 30, 30, 0.7) 50%, #fdfbf7 100%), url(/assets/terra_australis.jpg) no-repeat center top / cover',
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ maxWidth: 800 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.5,
                bgcolor: 'rgba(200, 167, 76, 0.2)', // Lighter gold background
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: '100px',
                mb: 3,
                color: '#fdfbf7' // Parchment text
              }}
            >
              <PublicIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                National Address Sovereignty
              </Typography>
            </Box>

            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2.5rem', md: '4.5rem' },
                fontWeight: 900,
                lineHeight: 1.1,
                mb: 3,
                fontFamily: '"Playfair Display", serif',
                color: '#fdfbf7', // Light parchment
                textShadow: '0 2px 20px rgba(0,0,0,0.5)'
              }}
            >
              Precision Geocoding <br />
              <Box component="span" sx={{ color: 'primary.main', fontStyle: 'italic' }}>for Australia.</Box>
            </Typography>

            <Typography
              variant="h6"
              sx={{
                color: 'grey.300', // Light grey for readability
                fontWeight: 400,
                mb: 5,
                lineHeight: 1.6,
                fontSize: '1.25rem',
                maxWidth: 650,
                textShadow: '0 1px 4px rgba(0,0,0,0.8)'
              }}
            >
              The unified engine for G-NAF, LGA, and Mesh Block resolution.
              Built for speed, governance, and structural address integrity at a national scale.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                component={Link}
                to="/search"
                variant="contained"
                size="large"
                sx={{
                  bgcolor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' },
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}
              >
                Launch Single Search
              </Button>
              <Button
                component={Link}
                to="/batch"
                variant="outlined"
                size="large"
                sx={{
                  borderColor: 'rgba(255,255,255,0.5)',
                  color: '#fdfbf7',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'primary.main' },
                  px: 4,
                  borderRadius: 2,
                  fontWeight: 700
                }}
              >
                Batch Processing
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg">
        {/* 2. Key Data Layers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 4,
            mt: -10,
            mb: 10,
            position: 'relative',
            zIndex: 10
          }}
        >
          {[
            {
              title: 'Addresses',
              value: '16.7M+',
              sub: 'Valid Australian Addresses (G-NAF)',
              icon: <MapIcon />,
            },
            {
              title: 'Local Government',
              value: '548 Regions',
              sub: 'Council Area Boundaries',
              icon: <PublicIcon />,
            },
            {
              title: 'Micro-Regions',
              value: '360k+ Units',
              sub: 'ABS Mesh Block Areas',
              icon: <StorageIcon />,
            },
            {
              title: 'Remoteness',
              value: '1 to 7 Scale',
              sub: 'Modified Monash Model (MMM)',
              icon: <PlayArrowIcon />,
            }
          ].map((card, idx) => (
            <Paper
              key={idx}
              elevation={0}
              sx={{
                p: { xs: 3, md: 4 },
                textAlign: 'center',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)',
                bgcolor: 'white',
                transition: 'transform 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-5px)',
                  borderColor: 'primary.light'
                }
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'rgba(141, 116, 53, 0.1)',
                  color: 'primary.main',
                  mx: 'auto',
                  mb: 2.5
                }}
              >
                {card.icon}
              </Box>
              <Typography variant="h4" fontWeight={900} sx={{ color: 'text.primary', mb: 0.5, fontFamily: '"Playfair Display", serif' }}>
                {card.value}
              </Typography>
              <Typography variant="subtitle2" fontWeight={700} color="primary.main" sx={{ mb: 1 }}>
                {card.title}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2 }}>
                {card.sub}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* 3. Help / Platform Guidance */}
        <Box sx={{ mb: 10 }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography variant="h4" fontWeight={800} sx={{ mb: 1, fontFamily: '"Playfair Display", serif' }}>
              Platform Guidance
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Maximize your data resolution precision with our core tools.
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 4 }}>
            {[
              {
                title: 'Single Address Search',
                icon: <SearchIcon />,
                desc: 'Rapidly verify individual locations and explore their spatial attributes.',
                path: '/search'
              },
              {
                title: 'Batch Geocoding',
                icon: <CloudUploadIcon />,
                desc: 'Process thousands of addresses with a simple drag-and-drop CSV interface.',
                path: '/batch'
              },
              {
                title: 'Data Pipeline & Governance',
                icon: <SettingsIcon />,
                desc: 'Monitor live data ingestion pipelines, trigger database refreshes, and track G-NAF update cycles.',
                path: '/refresh'
              }
            ].map((item, idx) => (
              <Paper
                key={idx}
                elevation={0}
                sx={{
                  p: 4,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'white',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 20px -5px rgba(141, 116, 53, 0.1)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
                  <Box sx={{ color: 'primary.main', mt: 0.5 }}>{item.icon}</Box>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={800} gutterBottom sx={{ fontFamily: '"Playfair Display", serif' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
                      {item.desc}
                    </Typography>
                    <Button
                      component={Link}
                      to={item.path}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        p: 0,
                        minWidth: 0,
                        color: 'primary.main',
                        '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' }
                      }}
                    >
                      Open {item.title.split(' ')[0]} &rarr;
                    </Button>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>

        {/* 4. Infrastructure & Governance */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 3,
            bgcolor: '#fdfbf7',
            border: '1px solid #d0c9b5',
            display: 'grid',
            gridTemplateColumns: { md: '1fr 1fr' },
            gap: 6,
            alignItems: 'center'
          }}
        >
          <Box>
            <Typography variant="overline" color="primary.main" fontWeight={800} sx={{ letterSpacing: '0.1em' }}>
              Automated Data Management
            </Typography>
            <Typography variant="h4" fontWeight={800} sx={{ my: 2, fontFamily: '"Playfair Display", serif', color: 'text.primary' }}>
              Fresh Data, <br />Without the Effort
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.7 }}>
              Our system automatically discovers and installs the latest address updates from official government sources.
              By managing the entire data lifecycle in the background, we ensure your searches are always based on the
              most current national information without any manual effort.
            </Typography>
            <Button
              component={Link}
              to="/refresh"
              variant="contained"
              sx={{
                borderRadius: 2,
                px: 4,
                py: 1.5,
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
                fontWeight: 700
              }}
            >
              Control Center
            </Button>
          </Box>
          <Box
            sx={{
              bgcolor: 'white',
              p: 3,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
            }}
          >
            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 3, px: 1, color: 'primary.main' }}>Live System Status</Typography>
            {[
              { label: 'Data Discovery', status: 'Optimal' },
              { label: 'Cloud Sync', status: 'Active' },
              { label: 'Service Health', status: 'Online' },
              { label: 'Index Version', status: 'Current' }
            ].map((step, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 1, '&:last-child': { mb: 0 } }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary">{step.label}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                  <Typography variant="caption" fontWeight={700} color="success.main">{step.status}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      </Container>
    </Box >
  );
};

function App() {
  return (
    <Authenticator.Provider>
      <Router>
        <CustomAuthenticator>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<GeocodingPage />} />
              <Route path="/batch" element={<BatchGeocodingPage />} />
              <Route path="/refresh" element={<DataRefreshPage />} />
              <Route path="/apis" element={<APIsPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        </CustomAuthenticator>
      </Router>
    </Authenticator.Provider>
  );
}

export default App;
