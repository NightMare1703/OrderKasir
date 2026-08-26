// import React from 'react'
import { useState } from 'react'
import { Button, Text, View } from 'react-native'

const App = () => {

  const [number, setNumber] = useState(0)

  return (
    <View style={styles.container}>
      <Text style={styles.app}>App</Text>
      <View style={{ margin: 50 }}>
        <Button style={{ backgroundColor: 'black', fontSize: 30 }} title='+' onPress={() => setNumber(number + 1)} />
        <Text
          style={{
            marginHorizontal: 20,
            marginVertical: 20,
            fontSize: 30,
            fontWeight: 'bold'
          }}
        >{number}</Text>
        <Button style={{ backgroundColor: 'black', fontSize: 30 }} title='-' onPress={() => setNumber(number - 1)} />
      </View>
    </View >
  )
}

const styles = {
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  app: {
    color: 'red',
    fontSize: 50,
    fontWeight: 'bold',

  }
}

export default App