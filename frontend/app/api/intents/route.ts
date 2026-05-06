import {NextResponse} from 'next/server';

const mockIntents = [
  {
    id: 'demo-intent',
    state: 'PENDING',
    sourceChainId: 11155111,
    destChainId: 84532,
    user: '0x0000000000000000000000000000000000000001',
  },
  {
    id: 'intent-seed-2',
    state: 'MATCHED',
    sourceChainId: 1,
    destChainId: 8453,
    user: '0x0000000000000000000000000000000000000002',
  },
];

export async function GET() {
  return NextResponse.json({intents: mockIntents});
}
