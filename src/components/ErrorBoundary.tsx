import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends Component<Props,State>{
  state: State = { hasError:false };
  static getDerivedStateFromError(error: Error): State { return { hasError:true, message:error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo){ console.error('[Bet Builder UI boundary]', error, info); }
  render(){
    if(!this.state.hasError) return this.props.children;
    return <main className="bb-error-boundary" role="alert">
      <div className="bb-error-card">
        <AlertTriangle size={20}/>
        <span className="bb-eyebrow">RECOVERY STATE · M36</span>
        <h1>Interface recovery required</h1>
        <p>The current view failed safely. No execution action was attempted.</p>
        {this.state.message&&<code>{this.state.message}</code>}
        <button type="button" onClick={()=>window.location.reload()}><RefreshCw size={14}/> Reload interface</button>
      </div>
    </main>;
  }
}
