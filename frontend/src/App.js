// import logo from './logo.svg';
import React from 'react'
import './App.css';

import {
  SERVER_URL,
} from './constants'
import { socket } from './services';


class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      fetchData: null,
      socketData: null,
    }
  }
  async componentDidMount() {
    const req = await fetch(`${SERVER_URL}/`, {
      mode: 'cors',
    })
    const { data } = await req.json()
    console.log(data)
    this.setState({
      fetchData: data,
    })

    socket.emit('data', (data) => this.setState({
      socketData: data,
    }))
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          {/* <img src={logo} className="App-logo" alt="logo" /> */}
          <p>
            Edit <code>src/App.js</code> and save to reload.
          </p>
          <p>Fetch data: {this.state.fetchData}</p>
          <p>Socket data: {this.state.socketData}</p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
        </header>
      </div>
    );
  }
}

export default App;
