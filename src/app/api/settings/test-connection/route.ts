// src/app/api/settings/test-connection/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Import here to avoid module loading issues
    const { getStashConfig } = await import("@/server/stashConfig");
    
    const { serverUrl, graphqlUrl, apiKey } = await getStashConfig();
    
    // Test GraphQL endpoint with a simple version query
    const testQuery = `
      query {
        version {
          version
          build_time
        }
      }
    `;
    
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        query: testQuery,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return NextResponse.json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: errorText,
        serverUrl,
        graphqlUrl,
      }, { status: 200 });
    }
    
    const data = await response.json();
    
    if (data.errors) {
      return NextResponse.json({
        success: false,
        error: 'GraphQL errors',
        details: data.errors.map((e: { message: string }) => e.message).join(', '),
        serverUrl,
        graphqlUrl,
      }, { status: 200 });
    }
    
    const version = data.data?.version;
    
    return NextResponse.json({
      success: true,
      message: 'Connection successful',
      serverUrl,
      graphqlUrl,
      version: version?.version || 'Unknown',
      buildTime: version?.build_time || 'Unknown',
    }, { status: 200 });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle specific error types
    if (message.includes('STASH_SERVER is missing')) {
      return NextResponse.json({
        success: false,
        error: 'Stash Server URL not configured',
        details: 'Please enter your Stash server URL in the settings above.',
      }, { status: 200 });
    }
    
    if (message.includes('STASH_API is missing')) {
      return NextResponse.json({
        success: false,
        error: 'Stash API key not configured',
        details: 'Please enter your Stash API key in the settings above.',
      }, { status: 200 });
    }
    
    if (message.includes('not a valid URL')) {
      return NextResponse.json({
        success: false,
        error: 'Invalid Stash Server URL',
        details: message,
      }, { status: 200 });
    }
    
    if (message.includes('fetch')) {
      return NextResponse.json({
        success: false,
        error: 'Network connection failed',
        details: 'Unable to connect to Stash server. Check the URL and ensure Stash is running.',
      }, { status: 200 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: message,
    }, { status: 200 });
  }
}