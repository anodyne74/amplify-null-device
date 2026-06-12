'use client';

import React, { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  AppBar,
  Box,
  Container,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  ThemeProvider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MapIcon from '@mui/icons-material/Map';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { getOperatorTheme } from '@/app/operator/mui-theme';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/operator/dashboard', icon: <DashboardIcon /> },
  { label: 'Routes', href: '/operator/routes', icon: <MapIcon /> },
  { label: 'Settings', href: '/operator/settings', icon: <SettingsIcon /> },
];

const DRAWER_WIDTH = 280;
const APP_BAR_HEIGHT = 68;
const APP_BAR_HEIGHT_MOBILE = 60;

interface OperatorMUILayoutProps {
  children: React.ReactNode;
  userEmail: string;
  onLogout: () => void;
}

/**
 * Operator Portal Layout using Material UI
 * Mobile-first design with AppBar and Drawer navigation
 * Applies NullDevice dark theme colors to MUI components
 */
export default function OperatorMUILayout({
  children,
  userEmail,
  onLogout,
}: OperatorMUILayoutProps) {
  const pathname = usePathname();
  const { resolvedMode } = useThemeMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const operatorTheme = useMemo(() => getOperatorTheme(resolvedMode), [resolvedMode]);

  const handleLogout = () => {
    setLogoutDialogOpen(false);
    onLogout();
  };

  const handleNavClick = () => {
    setDrawerOpen(false);
  };

  const drawerContent = (
    <Box
      sx={{
        width: DRAWER_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pt: 2,
        pb: 2,
        px: 2,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      {/* Brand */}
      <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid var(--nd-border-subtle)' }}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 1,
            borderRadius: 2,
            backgroundColor: 'color-mix(in srgb, var(--nd-text-primary) 3%, transparent)',
            border: '1px solid var(--nd-border-subtle)',
          }}
        >
          <Box
            component="img"
            src="/icon.svg"
            alt=""
            aria-hidden="true"
            sx={{ width: 44, height: 44, display: 'block' }}
          />
        </Box>
      </Box>

      {/* Navigation - grows to fill space */}
      <List
        sx={{
          flex: 1,
          mb: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname && (pathname === item.href || pathname.startsWith(item.href + '/'));
          return (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component={Link}
                href={item.href}
                onClick={handleNavClick}
                selected={Boolean(isActive)}
                aria-current={isActive ? 'page' : undefined}
                sx={{
                  borderRadius: 1,
                  color: isActive ? 'var(--nd-operator-accent)' : 'var(--nd-text-secondary)',
                  '&.Mui-selected': {
                    backgroundColor: 'color-mix(in srgb, var(--nd-operator-accent) 8%, transparent)',
                    color: 'var(--nd-operator-accent)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      sx={{
                        fontSize: '0.9rem',
                        fontFamily: 'var(--nd-font-mono, monospace)',
                        fontWeight: 500,
                        color: 'inherit',
                      }}
                    >
                      {item.label}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ my: 2, borderColor: 'var(--nd-border-subtle)' }} />

      {/* User Section - anchored to bottom */}
      <Box sx={{ mt: 'auto' }}>
        <Typography
          sx={{
            fontFamily: 'var(--nd-font-mono, monospace)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--nd-text-muted)',
            fontSize: '0.65rem',
            display: 'block',
            mt: 2,
            mb: 0.5,
          }}
        >
          Signed in as
        </Typography>
        <Typography
          sx={{
            color: 'var(--nd-text-secondary)',
            fontFamily: 'var(--nd-font-mono, monospace)',
            fontSize: '0.75rem',
            wordBreak: 'break-all',
            mb: 2,
          }}
        >
          {userEmail}
        </Typography>

        {/* Logout Button */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={() => setLogoutDialogOpen(true)}
          sx={{
            borderColor: 'var(--nd-border-default)',
            color: 'var(--nd-text-secondary)',
            fontSize: '0.75rem',
            py: 1,
            '&:hover': {
              borderColor: 'var(--nd-status-danger)',
              color: 'var(--nd-status-danger)',
            },
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={operatorTheme}>
      <Box data-role="operator" sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--nd-bg-void)' }}>
        {/* AppBar */}
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            width: '100%',
            ml: 0,
          }}
        >
          <Toolbar
            sx={{
              minHeight: {
                xs: `${APP_BAR_HEIGHT_MOBILE}px !important`,
                sm: `${APP_BAR_HEIGHT}px !important`,
              },
              py: { xs: 0.5, sm: 1 },
            }}
          >
            <IconButton
              edge="start"
              onClick={() => setDrawerOpen(!drawerOpen)}
              aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
              sx={{
                mr: { xs: 1, sm: 2 },
                color: 'var(--nd-text-primary)',
                border: '1px solid color-mix(in srgb, var(--nd-border-default) 72%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--nd-bg-surface) 86%, transparent)',
              }}
            >
              {drawerOpen ? <CloseIcon /> : <MenuIcon />}
            </IconButton>
            <Box
              component="img"
              src="/icon.svg"
              alt=""
              aria-hidden="true"
              sx={{
                width: { xs: 24, sm: 30 },
                height: { xs: 24, sm: 30 },
                display: 'block',
                mr: { xs: 1, sm: 1.5 },
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  flexGrow: 1,
                  fontFamily: 'var(--nd-font-display, Comfortaa, sans-serif)',
                  fontSize: { xs: '0.875rem', sm: '0.95rem' },
                  fontWeight: 500,
                  letterSpacing: '0.015em',
                  color: 'color-mix(in srgb, var(--nd-text-primary) 78%, transparent)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Welcome: {userEmail}
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Floating Drawer (all breakpoints) */}
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          variant="temporary"
          sx={{
            display: 'block',
            zIndex: (theme) => theme.zIndex.drawer,
            '& .MuiDrawer-paper': {
              width: { xs: 'min(82vw, 320px)', sm: DRAWER_WIDTH },
              boxSizing: 'border-box',
              backgroundColor: 'var(--nd-bg-surface)',
              top: { xs: `${APP_BAR_HEIGHT_MOBILE}px`, sm: `${APP_BAR_HEIGHT}px` },
              height: {
                xs: `calc(100dvh - ${APP_BAR_HEIGHT_MOBILE}px)`,
                sm: `calc(100dvh - ${APP_BAR_HEIGHT}px)`,
              },
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            mt: { xs: `${APP_BAR_HEIGHT_MOBILE}px`, sm: `${APP_BAR_HEIGHT}px` },
            pb: 2,
            px: { xs: 2, sm: 2, md: 3 },
            pt: 2,
            backgroundColor: 'var(--nd-bg-void)',
            boxSizing: 'border-box',
            marginLeft: 0,
            overflowY: 'visible',
            minHeight: {
              xs: `calc(100dvh - ${APP_BAR_HEIGHT_MOBILE}px)`,
              sm: `calc(100dvh - ${APP_BAR_HEIGHT}px)`,
            },
          }}
        >
          <Container
            maxWidth="lg"
            sx={{
              py: { xs: 1, sm: 2, md: 2 },
              px: { xs: 0, sm: 1, md: 2 },
            }}
          >
            {children}
          </Container>
        </Box>

        {/* Logout Confirmation Dialog */}
        <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
          <DialogTitle>Logout</DialogTitle>
          <DialogContent>
            <DialogContentText>Are you sure you want to logout?</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogout} color="error" variant="contained">
              Logout
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
