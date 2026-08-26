import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

const App = () => {
  const [number, setNumber] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.app}>App</Text>
      <View style={styles.counter}>
        <Button title="+" onPress={() => setNumber(number + 1)} />
        <Text style={styles.number}>{number}</Text>
        <Button title="-" onPress={() => setNumber(number - 1)} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  app: {
    color: 'red',
    fontSize: 50,
    fontWeight: 'bold',
  },
  counter: {
    margin: 50,
  },
  number: {
    marginHorizontal: 20,
    marginVertical: 20,
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default App;
