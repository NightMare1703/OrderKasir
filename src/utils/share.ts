import { Share } from 'react-native';

export const shareCsv = async (csv: string, fileName: string): Promise<void> => {
  await Share.share({
    message: csv,
    title: fileName,
  });
};
