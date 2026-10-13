export const account = (id: string) => `Account •${id.split(':').pop()?.slice(-6) ?? id.slice(-6)}`;
export const money = (minor: number) => Number.isSafeInteger(minor) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100) : 'Amount exceeds safe display precision';
export const inr = money;
export const utc = (value: string) => `${new Date(value).toISOString().replace('T', ' ').replace('.000Z', '')} UTC`;
export const milliseconds = (value: number | null) => value === null ? 'Not measured' : `${value.toFixed(2)} ms`;
