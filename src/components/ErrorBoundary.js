import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('❌ Error caught by boundary:', error);
        console.error('Error info:', errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    backgroundColor: '#fff0f4',
                    padding: '20px',
                    fontFamily: 'Arial, sans-serif'
                }}>
                    <div style={{ 
                        background: 'white', 
                        borderRadius: '20px', 
                        padding: '40px',
                        maxWidth: '500px',
                        textAlign: 'center',
                        boxShadow: '0 10px 30px rgba(255,122,162,0.2)'
                    }}>
                        <h1 style={{ color: '#ff7aa2', marginBottom: '10px' }}>😵 Oops!</h1>
                        <p style={{ fontSize: '16px', color: '#8c5b4a', marginBottom: '10px' }}>
                            Terjadi error yang tidak terduga
                        </p>
                        <details style={{ 
                            background: '#f5f5f5', 
                            padding: '10px', 
                            borderRadius: '8px', 
                            marginBottom: '20px',
                            textAlign: 'left',
                            fontSize: '12px'
                        }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                                Detail Error (untuk developer)
                            </summary>
                            <pre style={{ marginTop: '10px', overflow: 'auto' }}>
                                {this.state.error && this.state.error.toString()}
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                        <button
                            onClick={this.handleReset}
                            style={{
                                background: '#ff7aa2',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                fontSize: '16px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            🔄 Reload Aplikasi
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
