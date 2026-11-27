import 'dart:convert';
import 'dart:io';

import 'package:cross_file/cross_file.dart';
import 'package:eid_icao/eid_icao.dart';
import 'package:eid_nfc/eid_nfc.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BelgianEidApp());
}

class BelgianEidApp extends StatelessWidget {
  const BelgianEidApp({super.key});

  @override
  Widget build(BuildContext context) {
    const yellow = Color(0xFFD7AD01);
    return MaterialApp(
      title: 'Belgische eID NFC-lezer',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: yellow),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F7F7),
        appBarTheme: const AppBarTheme(
          backgroundColor: yellow,
          foregroundColor: Colors.black,
          centerTitle: false,
        ),
      ),
      home: const ReaderScreen(),
    );
  }
}

class ReaderScreen extends StatefulWidget {
  const ReaderScreen({super.key});

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  final _canController = TextEditingController();
  IcaoDocument? _document;
  bool _reading = false;
  double _progress = 0;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _canController.dispose();
    super.dispose();
  }

  Future<void> _readCard() async {
    final can = _canController.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(can)) {
      setState(() => _error = 'Vul de CAN-code van 6 cijfers in.');
      return;
    }

    setState(() {
      _reading = true;
      _progress = 0;
      _error = null;
      _message = 'NFC controleren…';
      _document = null;
    });

    NfcTransport? transport;
    try {
      final availability = await NfcTransport.availability();
      if (availability != NfcAvailability.available) {
        throw Exception(
          'NFC is niet beschikbaar. Controleer of je toestel NFC ondersteunt en NFC ingeschakeld is.',
        );
      }

      if (!mounted) return;
      setState(() => _message =
          'Houd de identiteitskaart tegen de NFC-zone van je smartphone.');

      transport = await NfcTransport.connect();
      final document = await IcaoReader(transport).read(
        access: IcaoAccessKey.can(can),
        onProgress: (fraction) {
          if (!mounted) return;
          setState(() {
            _progress = fraction.clamp(0.0, 1.0);
            _message = 'Chip uitlezen… ${(_progress * 100).round()}%';
          });
        },
      );
      await transport.finish(iosMessage: 'Uitlezing voltooid');

      if (!mounted) return;
      setState(() {
        _document = document;
        _message = 'De chip is uitgelezen.';
        _progress = 1;
      });
      _canController.clear();
    } catch (error) {
      if (transport != null) {
        try {
          await transport.finish(iosError: 'Uitlezing mislukt');
        } catch (_) {
          // De NFC-sessie kan al beëindigd zijn.
        }
      }
      if (!mounted) return;
      setState(() {
        _error = error is Exception
            ? icaoErrorMessage(error, IcaoLanguage.nl)
            : error.toString();
        _message = null;
      });
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  Map<String, dynamic> _exportData() {
    final document = _document!;
    return {
      'exportedAt': DateTime.now().toIso8601String(),
      'format': 'ICAO 9303',
      'mrz': {
        'lastName': document.mrz.lastName,
        'firstNames': document.mrz.firstNames,
        'birthDate': document.mrz.birthDate.toString(),
        'documentNumber': document.mrz.documentNumber,
        'expiryDate': document.mrz.expiryDate.toString(),
        'nationality': document.mrz.nationality,
      },
      'chipAuthenticity': document.authenticity?.name,
      'document': document.toJson(),
      'privacyNote':
          'De CAN-code en optionele persoonlijke nummers worden niet geëxporteerd door deze app.',
    };
  }

  Future<void> _exportJson() async {
    if (_document == null) return;
    try {
      final directory = await getTemporaryDirectory();
      final file = File(
        '${directory.path}/belgische_eid_${DateTime.now().millisecondsSinceEpoch}.json',
      );
      const encoder = JsonEncoder.withIndent('  ');
      await file.writeAsString(encoder.convert(_exportData()));
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/json')],
        text: 'Geëxporteerde eID-gegevens. Behandel dit bestand als vertrouwelijk.',
      );
    } catch (error) {
      _showError('JSON-export mislukt: $error');
    }
  }

  Future<void> _exportPdf() async {
    if (_document == null) return;
    try {
      final data = _exportData();
      final mrz = _document!.mrz;
      final pdf = pw.Document();
      pdf.addPage(
        pw.MultiPage(
          build: (context) => [
            pw.Header(level: 0, child: pw.Text('Belgische eID - chipuitlezing')),
            pw.Text('Naam: ${mrz.firstNames} ${mrz.lastName}'),
            pw.Text('Geboortedatum: ${mrz.birthDate}'),
            pw.Text('Documentnummer: ${mrz.documentNumber}'),
            pw.Text('Geldig tot: ${mrz.expiryDate}'),
            pw.Text('Nationaliteit: ${mrz.nationality}'),
            pw.SizedBox(height: 16),
            pw.Text('Chipcontrole: ${data['chipAuthenticity'] ?? 'Niet beschikbaar'}'),
            pw.SizedBox(height: 20),
            pw.Text(
              'Opmerking: deze export is een weergave van gegevens die van de NFC-chip zijn gelezen. '
              'Zonder vertrouwde CSCA-certificaten is de certificaatketen niet als vertrouwd bevestigd. '
              'Dit document is op zichzelf geen juridisch bewijs van identiteit of echtheid.',
              style: const pw.TextStyle(fontSize: 9),
            ),
            pw.SizedBox(height: 8),
            pw.Text('Gemaakt op: ${DateTime.now().toLocal()}',
                style: const pw.TextStyle(fontSize: 8)),
          ],
        ),
      );
      await Printing.sharePdf(
        bytes: await pdf.save(),
        filename: 'belgische_eid_uitlezing.pdf',
      );
    } catch (error) {
      _showError('PDF-export mislukt: $error');
    }
  }

  void _clearData() {
    setState(() {
      _document = null;
      _message = 'De gegevens zijn uit het scherm gewist.';
      _error = null;
      _progress = 0;
    });
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Widget _detail(String label, String? value) {
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(color: Colors.black54)),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final document = _document;
    return Scaffold(
      appBar: AppBar(title: const Text('Belgische eID NFC-lezer')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'Contactloze identiteitskaart uitlezen',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Text(
            'Voer de CAN-code in die op je identiteitskaart staat. '
            'Daarna kan je de kaart tegen de NFC-zone van je smartphone houden.',
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _canController,
            enabled: !_reading,
            keyboardType: TextInputType.number,
            maxLength: 6,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'CAN-code (6 cijfers)',
              hintText: '••••••',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock_outline),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _reading ? null : _readCard,
            icon: const Icon(Icons.contactless),
            label: Text(_reading ? 'Bezig met uitlezen…' : 'Start NFC-uitlezing'),
          ),
          if (_reading) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(value: _progress == 0 ? null : _progress),
          ],
          if (_message != null) ...[
            const SizedBox(height: 12),
            Text(_message!, style: const TextStyle(color: Colors.black54)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          if (document != null) ...[
            const SizedBox(height: 24),
            const Divider(),
            const Text(
              'Gelezen gegevens',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            if (document.photo != null) ...[
              const SizedBox(height: 14),
              Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(
                    document.photo!,
                    height: 190,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) =>
                        const Text('Pasfoto kon niet worden weergegeven.'),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _detail('Familienaam', document.mrz.lastName),
                    _detail('Voornamen', document.mrz.firstNames),
                    _detail('Geboortedatum', document.mrz.birthDate.toString()),
                    _detail('Documentnummer', document.mrz.documentNumber),
                    _detail('Geldig tot', document.mrz.expiryDate.toString()),
                    _detail('Nationaliteit', document.mrz.nationality),
                    _detail(
                      'Chipcontrole',
                      document.authenticity?.name ?? 'Niet beschikbaar',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Privacy: de CAN-code wordt niet bewaard. De optionele nationale identificatienummers worden niet opgevraagd. '
              'Geëxporteerde bestanden kunnen wel gevoelige persoonsgegevens bevatten.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _exportJson,
              icon: const Icon(Icons.data_object),
              label: const Text('Exporteer JSON'),
            ),
            OutlinedButton.icon(
              onPressed: _exportPdf,
              icon: const Icon(Icons.picture_as_pdf),
              label: const Text('Exporteer PDF'),
            ),
            TextButton.icon(
              onPressed: _clearData,
              icon: const Icon(Icons.delete_outline),
              label: const Text('Wis gelezen gegevens'),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
            ),
          ],
          const SizedBox(height: 24),
          const Text(
            'Let op: dit werkt met de contactloze ICAO-chip van geschikte eID-kaarten. '
            'Niet met de klassieke contactchip. De officiële certificaten van de uitgevende landen '
            'zijn nog niet opgenomen; een geslaagde uitlezing bewijst dus niet zelfstandig de echtheid van de kaart.',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
        ],
      ),
    );
  }
}
