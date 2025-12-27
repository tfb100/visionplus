import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

class DetectionEngine {
    constructor() {
        this.model = null;
        this.isLoading = true;
        this.minConfidence = 0.6;
        this.lowConfidenceThreshold = 0.4;
    }

    async load() {
        this.model = await cocoSsd.load({
            base: 'mobilenet_v2'
        });
        this.isLoading = false;
        console.log('Model loaded');
    }

    async detect(video) {
        if (!this.model) return [];
        const predictions = await this.model.detect(video);
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;

        return predictions.map(p => {
            let status = 'certain';
            if (p.score < this.minConfidence && p.score >= this.lowConfidenceThreshold) {
                status = 'uncertain';
            } else if (p.score < this.lowConfidenceThreshold) {
                status = 'unknown';
            }

            const [x, y, width, height] = p.bbox;
            const area = (width / vWidth) * (height / vHeight);

            // Spatial logic
            const isOnFloor = (y + height) > (vHeight * 0.75);
            const isCentered = (x + width / 2) > (vWidth * 0.3) && (x + width / 2) < (vWidth * 0.7);

            if (area < 0.05 && status !== 'unknown') {
                status = 'get_closer';
            }

            return {
                ...p,
                risk: this.classifyRisk(p.class),
                status: status,
                isSafetyCritical: ['traffic light', 'stop sign', 'car', 'bus', 'truck'].includes(p.class) || (isOnFloor && isCentered),
                isFloorBarrier: isOnFloor && isCentered
            };
        });
    }

    classifyRisk(className) {
        const highRisk = ['car', 'bus', 'truck', 'motorcycle', 'bicycle'];
        const mediumRisk = ['person', 'dog', 'cat', 'stairs', 'traffic light', 'stop sign', 'bench', 'chair'];

        if (highRisk.includes(className)) return 'high';
        if (mediumRisk.includes(className)) return 'medium';
        return 'low';
    }

    getDetailedDescription(prediction) {
        const { class: label, bbox, status, isFloorBarrier } = prediction;
        const [x, y, width, height] = bbox;

        if (status === 'unknown') return 'Objeto desconhecido';

        const centerX = x + width / 2;
        const position = centerX < 250 ? 'à esquerda' : (centerX > 390 ? 'à direita' : 'à frente');

        // Floor Barrier Logic
        if (isFloorBarrier) {
            return `Cuidado: obstáculo no chão à frente. Reduza a velocidade.`;
        }

        // Specialized safety warnings
        if (label === 'traffic light') {
            return `Semáforo à frente. Atenção redobrada ao atravessar.`;
        }
        if (label === 'stop sign') {
            return `Placa de Pare detectada. Aguarde orientação ou ajuda.`;
        }
        if (['car', 'bus', 'truck'].includes(label) && position === 'à frente') {
            return `Atenção: veículo em movimento à frente. Mantenha distância.`;
        }

        let baseDesc = `${this.translate(label)} ${position}`;
        if (status === 'get_closer') baseDesc += '. Aproxime-se para confirmar.';
        if (status === 'uncertain') baseDesc = 'Pode ser ' + baseDesc;

        return baseDesc;
    }

    translate(label) {
        const dict = {
            'person': 'pessoa',
            'bicycle': 'bicicleta',
            'car': 'carro',
            'motorcycle': 'moto',
            'airplane': 'avião',
            'bus': 'ônibus',
            'train': 'trem',
            'truck': 'caminhão',
            'boat': 'barco',
            'traffic light': 'semáforo',
            'fire hydrant': 'hidrante',
            'stop sign': 'placa de pare',
            'parking meter': 'parquímetro',
            'bench': 'banco',
            'bird': 'pássaro',
            'cat': 'gato',
            'dog': 'cachorro',
            'horse': 'cavalo',
            'sheep': 'ovelha',
            'cow': 'vaca',
            'elephant': 'elefante',
            'bear': 'urso',
            'zebra': 'zebra',
            'giraffe': 'girafa',
            'backpack': 'mochila',
            'umbrella': 'guarda-chuva',
            'handbag': 'bolsa',
            'tie': 'gravata',
            'suitcase': 'mala',
            'frisbee': 'frisbee',
            'skis': 'esquis',
            'snowboard': 'snowboard',
            'sports ball': 'bola',
            'kite': 'pipa',
            'baseball bat': 'taco de beisebol',
            'baseball glove': 'luva de beisebol',
            'skateboard': 'skate',
            'surfboard': 'prancha de surfe',
            'tennis racket': 'raquete de tênis',
            'bottle': 'garrafa',
            'wine glass': 'taça de vinho',
            'cup': 'copo',
            'fork': 'garfo',
            'knife': 'faca',
            'spoon': 'colher',
            'bowl': 'tigela',
            'banana': 'banana',
            'apple': 'maçã',
            'sandwich': 'sanduíche',
            'orange': 'laranja',
            'broccoli': 'brócolis',
            'carrot': 'cenoura',
            'hot dog': 'cachorro-quente',
            'pizza': 'pizza',
            'donut': 'rosquinha',
            'cake': 'bolo',
            'chair': 'cadeira',
            'couch': 'sofá',
            'potted plant': 'vaso de planta',
            'bed': 'cama',
            'dining table': 'mesa de jantar',
            'toilet': 'vaso sanitário',
            'tv': 'televisão',
            'laptop': 'notebook',
            'mouse': 'mouse',
            'remote': 'controle remoto',
            'keyboard': 'teclado',
            'cell phone': 'celular',
            'microwave': 'micro-ondas',
            'oven': 'forno',
            'toaster': 'torradeira',
            'sink': 'pia',
            'refrigerator': 'geladeira',
            'book': 'livro',
            'clock': 'relógio',
            'vase': 'vaso',
            'scissors': 'tesoura',
            'teddy bear': 'ursinho de pelúcia',
            'hair drier': 'secador de cabelo',
            'toothbrush': 'escova de dentes',
            'stairs': 'escada'
        };
        return dict[label] || label;
    }
}

export default new DetectionEngine();
