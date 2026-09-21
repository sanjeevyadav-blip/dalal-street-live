// Diagnoses the "Unable to establish loopback connection" Gradle failure on this machine.
//
//   java scripts/diagnose-gradle-loopback.java
//
// WHAT THIS IS FOR
//
// `npm run app:build` fails on this machine with:
//
//     FAILURE: Build failed with an exception.
//     * What went wrong:
//     java.io.IOException: Unable to establish loopback connection
//
// That message points at Gradle, and it is not Gradle's fault. Gradle forks a daemon
// process and talks to it over a local socket using Java NIO. On Windows, Java NIO
// implements Pipe and Selector as a TCP socket pair on 127.0.0.1 — the JVM binds a
// listener, connects to itself, and exchanges a random secret to confirm the peer is
// really itself. If anything on the machine interferes with that self-connection, every
// NIO Selector in every Java program fails, and Gradle is simply the first thing you
// notice it in.
//
// This script separates the layers so the answer is not a guess:
//
//   plain loopback OK + Pipe/Selector FAILED  -> security software is the cause.
//       Not a Gradle, Capacitor or JDK problem, and no Gradle flag fixes it. Android
//       Studio would fail identically, as would any Java build tool.
//   everything OK                             -> the Gradle failure is something else;
//       re-run the build with --stacktrace.
//   plain loopback FAILED                     -> loopback is blocked outright; check the
//       firewall and the hosts file.
//
// FIXING IT is an endpoint-security change, not a code change: an exclusion for java.exe
// in whatever host firewall or endpoint protection the machine runs. On a corporate
// machine that is usually an IT request. Nothing in this repo can work around it.

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.channels.Pipe;
import java.nio.channels.Selector;

public class DiagnoseGradleLoopback {

    static boolean plainLoopback() {
        try (ServerSocket ss = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
            int port = ss.getLocalPort();
            Thread accepter = new Thread(() -> {
                try { ss.accept(); } catch (IOException ignored) { }
            });
            accepter.setDaemon(true);
            accepter.start();
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 5000);
            }
            System.out.println("  ok    plain loopback socket (bind + connect on 127.0.0.1)");
            return true;
        } catch (Exception e) {
            System.out.println("  FAIL  plain loopback socket: " + e);
            return false;
        }
    }

    static boolean nioPipe() {
        // Pipe is not AutoCloseable — its two channels are, individually.
        Pipe p = null;
        try {
            p = Pipe.open();
            System.out.println("  ok    java.nio Pipe.open()");
            return true;
        } catch (Throwable e) {
            System.out.println("  FAIL  java.nio Pipe.open(): " + e);
            return false;
        } finally {
            if (p != null) {
                try { p.sink().close(); } catch (IOException ignored) { }
                try { p.source().close(); } catch (IOException ignored) { }
            }
        }
    }

    static boolean nioSelector() {
        try (Selector s = Selector.open()) {
            System.out.println("  ok    java.nio Selector.open()   <- what Gradle's daemon needs");
            return true;
        } catch (Throwable e) {
            System.out.println("  FAIL  java.nio Selector.open(): " + e);
            return false;
        }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("Gradle loopback diagnosis");
        System.out.println("  java    " + System.getProperty("java.version")
            + "  (" + System.getProperty("java.vendor") + ")");
        System.out.println("  host    " + InetAddress.getLocalHost());
        System.out.println();

        boolean plain = plainLoopback();
        boolean pipe = nioPipe();
        boolean selector = nioSelector();
        System.out.println();

        if (plain && !(pipe && selector)) {
            System.out.println("DIAGNOSIS: endpoint security is blocking Java NIO's loopback socket pair.");
            System.out.println("  Ordinary loopback works, so this is not a firewall blocking 127.0.0.1");
            System.out.println("  wholesale. It is the self-connection handshake NIO uses for Pipe and");
            System.out.println("  Selector, which some endpoint-protection products intercept.");
            System.out.println();
            System.out.println("  Consequence: NO Java build tool works on this machine. Gradle, Maven's");
            System.out.println("  daemon and Android Studio all fail the same way. No Gradle flag helps.");
            System.out.println();
            System.out.println("  Fix: an endpoint-protection / host-firewall exclusion for java.exe.");
            System.out.println("  On a managed machine that is an IT request, not a code change.");
            System.exit(1);
        }
        if (!plain) {
            System.out.println("DIAGNOSIS: loopback is blocked outright. Check the host firewall and");
            System.out.println("  that 127.0.0.1 resolves (hosts file).");
            System.exit(1);
        }
        System.out.println("DIAGNOSIS: loopback and NIO are both healthy, so a Gradle failure here is");
        System.out.println("  something else. Re-run: cd android && gradlew assembleDebug --stacktrace");
    }
}
