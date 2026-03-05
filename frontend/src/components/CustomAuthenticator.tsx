import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import AboutModal from './AboutModal';

const CustomAuthenticator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { authStatus } = useAuthenticator(context => [context.authStatus]);
    const [aboutOpen, setAboutOpen] = useState(false);

    // If authenticated, render the app (children) directly, bypassing the split-screen layout
    if (authStatus === 'authenticated') {
        return <>{children}</>;
    }

    // If not authenticated, render the Split-Screen Login
    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Left Panel - Branding */}
            <Box
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    width: '70%',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    position: 'relative',
                    backgroundImage: 'url(/assets/terra_australis.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(135deg, rgba(44, 44, 44, 0.75) 0%, rgba(44, 44, 44, 0.5) 100%)',
                    }
                }}
            >
                <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', p: 6 }}>
                    <Typography
                        variant="h3"
                        sx={{
                            fontFamily: '"Playfair Display", serif',
                            fontWeight: 700,
                            color: '#fdfbf7',
                            mb: 2,
                            textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                            letterSpacing: '0.05em'
                        }}
                    >
                        Australian Geocoding Platform
                    </Typography>
                    <Box sx={{
                        width: 80,
                        height: 3,
                        bgcolor: '#c8a74c',
                        mx: 'auto',
                        mt: 4,
                        opacity: 0.8
                    }} />
                </Box>
            </Box>

            {/* Right Panel - Authenticator */}
            <Box
                sx={{
                    width: { xs: '100%', md: '30%' },
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    bgcolor: '#fdfbf7',
                    p: 4,
                    boxShadow: { md: '-10px 0 30px rgba(0,0,0,0.05)' },
                    position: 'relative',
                    zIndex: 2
                }}
            >
                <Box sx={{ width: '100%', maxWidth: 420 }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography
                            variant="h4"
                            sx={{
                                fontFamily: '"Playfair Display", serif',
                                fontWeight: 700,
                                color: '#2c2c2c',
                                mb: 1
                            }}
                        >
                            Welcome Back
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Sign in to access Australian Geocoding
                        </Typography>
                    </Box>

                    {/* Authenticator handles the login form state */}
                    <Authenticator
                        initialState="signIn"
                        formFields={{
                            signIn: {
                                username: {
                                    label: 'Email',
                                    placeholder: 'Enter your email',
                                },
                            },
                            signUp: {
                                name: {
                                    label: 'Full Name',
                                    placeholder: 'Enter your full name',
                                    isRequired: true,
                                    order: 1
                                },
                                email: {
                                    label: 'Email',
                                    placeholder: 'Enter your email',
                                    isRequired: true,
                                    order: 2
                                },
                                password: {
                                    label: 'Password',
                                    placeholder: 'Enter your password',
                                    isRequired: true,
                                    order: 3
                                },
                                confirm_password: {
                                    label: 'Confirm Password',
                                    placeholder: 'Confirm your password',
                                    isRequired: true,
                                    order: 4
                                }
                            }
                        }}
                    >
                        {/* We don't render children here anymore, as we handle 'authenticated' state above */}
                        <></>
                    </Authenticator>

                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                        <Button
                            variant="outlined"
                            onClick={() => setAboutOpen(true)}
                            sx={{
                                color: 'primary.main',
                                borderColor: 'primary.main',
                                fontWeight: 700,
                                px: 4,
                                py: 1,
                                borderRadius: 2,
                                borderWidth: 2,
                                textTransform: 'none',
                                '&:hover': {
                                    bgcolor: 'rgba(200, 167, 76, 0.05)',
                                    borderWidth: 2,
                                    borderColor: 'primary.dark',
                                    color: 'primary.dark'
                                }
                            }}
                        >
                            About the Platform
                        </Button>
                    </Box>

                    <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
                </Box>
            </Box>
        </Box>
    );
};

export default CustomAuthenticator;
