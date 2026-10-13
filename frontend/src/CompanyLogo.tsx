import React, { useState, useEffect } from 'react';

// Default Logo.dev Publishable Key from configuration
export const LOGO_DEV_PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_LOGO_DEV_TOKEN || 'pk_Jle1DJd9QZiaRxuzH0vxuw';

export interface BrandMetadata {
  domain: string;
  name: string;
  color: string;
}

// Brand mapping database for banks, fintechs, and common merchants
export const BRAND_REGISTRY: Record<string, BrandMetadata> = {
  // --- Indian & Global Banks ---
  hdfc: { domain: 'hdfcbank.com', name: 'HDFC Bank', color: '#004c8f' },
  'hdfc bank': { domain: 'hdfcbank.com', name: 'HDFC Bank', color: '#004c8f' },
  icici: { domain: 'icicibank.com', name: 'ICICI Bank', color: '#b02a30' },
  'icici bank': { domain: 'icicibank.com', name: 'ICICI Bank', color: '#b02a30' },
  sbi: { domain: 'sbi.co.in', name: 'State Bank of India', color: '#1a5276' },
  'state bank of india': { domain: 'sbi.co.in', name: 'State Bank of India', color: '#1a5276' },
  axis: { domain: 'axisbank.com', name: 'Axis Bank', color: '#97144d' },
  'axis bank': { domain: 'axisbank.com', name: 'Axis Bank', color: '#97144d' },
  kotak: { domain: 'kotak.com', name: 'Kotak Mahindra Bank', color: '#ed1b24' },
  'kotak mahindra bank': { domain: 'kotak.com', name: 'Kotak Mahindra Bank', color: '#ed1b24' },
  bob: { domain: 'bankofbaroda.in', name: 'Bank of Baroda', color: '#f26522' },
  'bank of baroda': { domain: 'bankofbaroda.in', name: 'Bank of Baroda', color: '#f26522' },
  pnb: { domain: 'pnbindia.in', name: 'Punjab National Bank', color: '#a21d22' },
  canara: { domain: 'canarabank.com', name: 'Canara Bank', color: '#0091d0' },
  'idfc first': { domain: 'idfcfirstbank.com', name: 'IDFC First Bank', color: '#9d1d27' },
  'yes bank': { domain: 'yesbank.in', name: 'Yes Bank', color: '#003366' },
  'standard chartered': { domain: 'sc.com', name: 'Standard Chartered', color: '#007a3d' },
  hsbc: { domain: 'hsbc.co.in', name: 'HSBC', color: '#db0011' },
  citi: { domain: 'citi.com', name: 'Citibank', color: '#003b70' },

  // --- UPI & Fintech ---
  upi: { domain: 'bhimupi.org.in', name: 'BHIM UPI', color: '#5b21b6' },
  bhim: { domain: 'bhimupi.org.in', name: 'BHIM UPI', color: '#5b21b6' },
  gpay: { domain: 'pay.google.com', name: 'Google Pay', color: '#4285f4' },
  'google pay': { domain: 'pay.google.com', name: 'Google Pay', color: '#4285f4' },
  phonepe: { domain: 'phonepe.com', name: 'PhonePe', color: '#5f259f' },
  paytm: { domain: 'paytm.com', name: 'Paytm', color: '#00b9f5' },
  cred: { domain: 'cred.club', name: 'CRED', color: '#111827' },
  razorpay: { domain: 'razorpay.com', name: 'Razorpay', color: '#0c2340' },
  zerodha: { domain: 'zerodha.com', name: 'Zerodha', color: '#387ed1' },
  groww: { domain: 'groww.in', name: 'Groww', color: '#00d09c' },

  // --- E-Commerce & Retail ---
  amazon: { domain: 'amazon.in', name: 'Amazon', color: '#ff9900' },
  'amazon india': { domain: 'amazon.in', name: 'Amazon India', color: '#ff9900' },
  flipkart: { domain: 'flipkart.com', name: 'Flipkart', color: '#2874f0' },
  swiggy: { domain: 'swiggy.com', name: 'Swiggy', color: '#fc8019' },
  zomato: { domain: 'zomato.com', name: 'Zomato', color: '#cb202d' },
  uber: { domain: 'uber.com', name: 'Uber', color: '#000000' },
  ola: { domain: 'olacabs.com', name: 'Ola', color: '#181818' },
  zepto: { domain: 'zeptonow.com', name: 'Zepto', color: '#3b0066' },
  blinkit: { domain: 'blinkit.com', name: 'Blinkit', color: '#f8cb46' },
  netflix: { domain: 'netflix.com', name: 'Netflix', color: '#e50914' },
  spotify: { domain: 'spotify.com', name: 'Spotify', color: '#1db954' },
  apple: { domain: 'apple.com', name: 'Apple', color: '#000000' },
  google: { domain: 'google.com', name: 'Google', color: '#4285f4' },
  airtel: { domain: 'airtel.in', name: 'Airtel', color: '#ed1c24' },
  jio: { domain: 'jio.com', name: 'Jio', color: '#0a2885' },
  starbucks: { domain: 'starbucks.in', name: 'Starbucks', color: '#006241' },
  shell: { domain: 'shell.in', name: 'Shell', color: '#fbce07' },
  'indian oil': { domain: 'iocl.com', name: 'Indian Oil', color: '#f37021' },
  irctc: { domain: 'irctc.co.in', name: 'IRCTC', color: '#213d77' },
  makemytrip: { domain: 'makemytrip.com', name: 'MakeMyTrip', color: '#008cff' },
  myntra: { domain: 'myntra.com', name: 'Myntra', color: '#ff3f6c' },
  nykaa: { domain: 'nykaa.com', name: 'Nykaa', color: '#fc2779' },
  cultfit: { domain: 'cult.fit', name: 'Cult.fit', color: '#ff3278' },
  'cult.fit': { domain: 'cult.fit', name: 'Cult.fit', color: '#ff3278' },
  dmart: { domain: 'dmartindia.com', name: 'D-Mart', color: '#1c733c' },
  tata: { domain: 'tata.com', name: 'Tata', color: '#00509a' },
  reliance: { domain: 'ril.com', name: 'Reliance', color: '#00427a' },
};

/**
 * Resolve a raw bank or merchant string to a clean domain and metadata
 */
export function resolveBrand(raw: string): BrandMetadata {
  const clean = raw.trim().toLowerCase();

  // 1. Direct registry lookup
  if (BRAND_REGISTRY[clean]) return BRAND_REGISTRY[clean];

  // 2. Substring matching
  for (const [key, val] of Object.entries(BRAND_REGISTRY)) {
    if (clean.includes(key)) {
      return val;
    }
  }

  // 3. Fallback: clean up domain or generate generic
  let inferredDomain = clean
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16);
  if (!inferredDomain.includes('.')) {
    inferredDomain += '.com';
  }

  // Deterministic color generation based on name
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = raw.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const color = `hsl(${hue}, 65%, 45%)`;

  return {
    domain: inferredDomain,
    name: raw,
    color,
  };
}

export interface CompanyLogoProps {
  domain?: string;
  name?: string;
  size?: number;
  className?: string;
  token?: string;
  rounded?: boolean;
}

/**
 * Enterprise CompanyLogo component powered by Logo.dev
 * (with automatic CDN fallback to avoid broken images)
 */
export default function CompanyLogo({
  domain,
  name = 'Entity',
  size = 32,
  className = '',
  token = LOGO_DEV_PUBLISHABLE_KEY,
  rounded = true,
}: CompanyLogoProps) {
  const resolved = resolveBrand(domain || name);
  const activeDomain = domain || resolved.domain;

  // Tier 1: Logo.dev CDN (as per user instruction & docs)
  const logoDevUrl = `https://img.logo.dev/${encodeURIComponent(
    activeDomain
  )}?token=${encodeURIComponent(token)}&size=${size * 2}&format=png`;

  // Tier 2: Google High-Res Favicon CDN
  const fallbackUrl = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(
    activeDomain
  )}&size=128`;

  const [currentSrc, setCurrentSrc] = useState<string>(logoDevUrl);
  const [loadStage, setLoadStage] = useState<'logodev' | 'google' | 'monogram'>('logodev');

  useEffect(() => {
    setCurrentSrc(logoDevUrl);
    setLoadStage('logodev');
  }, [logoDevUrl]);

  const handleError = () => {
    if (loadStage === 'logodev') {
      setCurrentSrc(fallbackUrl);
      setLoadStage('google');
    } else {
      setLoadStage('monogram');
    }
  };

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: rounded ? '50%' : '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
  };

  if (loadStage === 'monogram') {
    const initials = (name || activeDomain)
      .split(' ')
      .slice(0, 2)
      .map(s => s[0])
      .join('')
      .toUpperCase();

    return (
      <div
        className={`company-logo-avatar monogram ${className}`}
        style={{
          ...containerStyle,
          backgroundColor: resolved.color,
          color: '#ffffff',
          fontWeight: 700,
          fontSize: Math.max(10, Math.round(size * 0.4)),
          border: 'none',
        }}
        title={`${name} (${activeDomain})`}
      >
        {initials || '•'}
      </div>
    );
  }

  return (
    <div
      className={`company-logo-avatar ${className}`}
      style={containerStyle}
      title={`${name} (${activeDomain})`}
    >
      <img
        src={currentSrc}
        alt={`${name} logo`}
        style={{
          width: '75%',
          height: '75%',
          objectFit: 'contain',
          display: 'block',
        }}
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
}
